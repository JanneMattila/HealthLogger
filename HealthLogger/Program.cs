using HealthLogger.Data;
using HealthLogger.Endpoints;
using HealthLogger.Repositories;
using HealthLogger.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<EntraAccessFilter>();

// Configure authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddMicrosoftIdentityWebApp(options =>
{
    builder.Configuration.GetSection("AzureAd").Bind(options);

    options.Events = new OpenIdConnectEvents
    {
        OnTokenValidated = async context =>
        {
            var accessFilter = context.HttpContext.RequestServices.GetRequiredService<EntraAccessFilter>();
            var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<EntraAccessFilter>>();
            var tenantId = EntraAccessFilter.GetTenantId(context.Principal) ?? "(missing)";
            var objectId = EntraAccessFilter.GetObjectId(context.Principal) ?? "(missing)";
            if (!accessFilter.IsAllowed(context.Principal))
            {
                logger.LogWarning(
                    "Entra login denied by access filters. TenantId: {TenantId}, ObjectId: {ObjectId}",
                    tenantId,
                    objectId);
                context.Fail("The user is not allowed by the configured tenant and user filters.");
                return;
            }

            logger.LogInformation(
                "Entra login accepted by access filters. TenantId: {TenantId}, ObjectId: {ObjectId}",
                tenantId,
                objectId);

            var userRepo = context.HttpContext.RequestServices.GetRequiredService<UserRepository>();
            var externalId = EntraAccessFilter.GetObjectId(context.Principal);
            var userName = context.Principal?.FindFirst("name")?.Value ?? "Unknown User";

            if (!string.IsNullOrEmpty(externalId))
            {
                var appUserId = await userRepo.GetOrCreateAppUserIdAsync(externalId, userName);
                var user = await userRepo.GetUserAsync(appUserId);

                if (context.Principal?.Identity is ClaimsIdentity identity)
                {
                    identity.AddClaim(new Claim("app_user_id", appUserId));
                    if (user?.IsAdmin == true)
                        identity.AddClaim(new Claim(ClaimTypes.Role, "Admin"));

                    Console.WriteLine($"[Auth] Entra ID user authenticated: {userName}, AppUserId: {appUserId}");
                }
            }

            if (context.Properties != null)
            {
                context.Properties.IsPersistent = true;
                context.Properties.ExpiresUtc = DateTimeOffset.UtcNow.AddDays(90);
            }
        },
        OnRemoteFailure = context =>
        {
            var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<EntraAccessFilter>>();
            var accessDenied = context.Failure?.ToString().Contains(
                "The user is not allowed by the configured tenant and user filters.",
                StringComparison.Ordinal) == true;

            if (accessDenied)
                logger.LogWarning("Entra login was rejected by the configured access filters.");
            else
                logger.LogError(context.Failure, "Entra remote login failed.");

            context.Response.Redirect(accessDenied
                ? "/?authError=access_denied"
                : "/?authError=login_failed");
            context.HandleResponse();
            return Task.CompletedTask;
        }
    };
}, cookieScheme: CookieAuthenticationDefaults.AuthenticationScheme)
.EnableTokenAcquisitionToCallDownstreamApi()
.AddInMemoryTokenCaches();

// Configure cookie options
builder.Services.Configure<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme, (CookieAuthenticationOptions options) =>
{
    options.Cookie.Name = "HealthLogger.Auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.ExpireTimeSpan = TimeSpan.FromDays(90);
    options.SlidingExpiration = true;
    options.Cookie.IsEssential = true;
    options.Cookie.MaxAge = TimeSpan.FromDays(90);
    options.Events.OnValidatePrincipal = async context =>
    {
        var accessFilter = context.HttpContext.RequestServices.GetRequiredService<EntraAccessFilter>();
        if (!accessFilter.IsAllowed(context.Principal))
        {
            var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<EntraAccessFilter>>();
            logger.LogWarning(
                "Existing session denied by access filters. TenantId: {TenantId}, ObjectId: {ObjectId}",
                EntraAccessFilter.GetTenantId(context.Principal) ?? "(missing)",
                EntraAccessFilter.GetObjectId(context.Principal) ?? "(missing)");
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        var appUserId = context.Principal?.FindFirst("app_user_id")?.Value;
        var userRepo = context.HttpContext.RequestServices.GetRequiredService<UserRepository>();
        if (!string.IsNullOrEmpty(appUserId) && await userRepo.GetUserAsync(appUserId) is not null)
            return;

        var externalId = EntraAccessFilter.GetObjectId(context.Principal);
        if (string.IsNullOrEmpty(externalId) || context.Principal?.Identity is not ClaimsIdentity identity)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        var userName = context.Principal.FindFirst("name")?.Value ?? "Unknown User";
        var repairedAppUserId = await userRepo.GetOrCreateAppUserIdAsync(externalId, userName);
        foreach (var claim in identity.FindAll("app_user_id").ToList())
            identity.RemoveClaim(claim);
        identity.AddClaim(new Claim("app_user_id", repairedAppUserId));
        context.ShouldRenew = true;
    };
});

var appUserPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
    .RequireAuthenticatedUser()
    .RequireClaim("app_user_id")
    .RequireAssertion(context => !context.User.HasClaim(claim => claim.Type == "guest_user_id"))
    .Build();

builder.Services.AddAuthorizationBuilder()
    .SetDefaultPolicy(appUserPolicy)
    .SetFallbackPolicy(appUserPolicy);
// Configure JSON serialization to handle EF circular references
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    options.SerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    options.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});

// Configure database
var databaseProvider = builder.Configuration.GetValue<string>("DatabaseProvider") ?? "SqlServer";
var connectionString = builder.Configuration.GetConnectionString(databaseProvider);

if (string.IsNullOrEmpty(connectionString))
{
    throw new InvalidOperationException($"{databaseProvider} connection string not found in configuration");
}

Console.WriteLine($"[Database] Using provider: {databaseProvider}");

builder.Services.AddDbContext<HealthLoggerDbContext>(options =>
{
    if (databaseProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(
                maxRetryCount: 5,
                maxRetryDelay: TimeSpan.FromSeconds(30),
                errorNumbersToAdd: null);
        });
    }
    else
    {
        options.UseSqlite(connectionString);
    }

    if (builder.Environment.IsDevelopment())
    {
        options.EnableSensitiveDataLogging();
        options.EnableDetailedErrors();
    }

    options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
});

// Register HttpClient for AI service
builder.Services.AddHttpClient();

// Register repositories
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<FoodRepository>();
builder.Services.AddScoped<EntryRepository>();
builder.Services.AddScoped<RecipeRepository>();
builder.Services.AddScoped<CheckinRepository>();
builder.Services.AddScoped<MetricsRepository>();

// Register services
builder.Services.AddScoped<StatsService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<NutritionSearchService>();
builder.Services.AddScoped<BarcodeFoodLookupService>();
builder.Services.AddSingleton<LocalizationService>();

// Configure QuestPDF
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var app = builder.Build();

// Apply database migrations
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<HealthLoggerDbContext>();
    try
    {
        var pendingMigrations = dbContext.Database.GetPendingMigrations().ToList();
        var appliedMigrations = dbContext.Database.GetAppliedMigrations().ToList();

        Console.WriteLine($"[Database] Applied migrations: {appliedMigrations.Count}");
        Console.WriteLine($"[Database] Pending migrations: {pendingMigrations.Count}");

        if (pendingMigrations.Count > 0)
        {
            Console.WriteLine("[Database] Applying migrations...");
            dbContext.Database.Migrate();
            Console.WriteLine("[Database] All migrations applied successfully");
        }
        else
        {
            Console.WriteLine("[Database] Database is up to date");
        }

        await DatabaseSeeder.SeedFoodDataAsync(dbContext);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Database] Error during migration: {ex.Message}");
        throw;
    }
}

var legacyPhotoDirectory = new DirectoryInfo(Path.GetFullPath(Path.Combine("data", "photos")));
if (legacyPhotoDirectory.Exists)
{
    if (legacyPhotoDirectory.Attributes.HasFlag(FileAttributes.ReparsePoint))
    {
        app.Logger.LogWarning(
            "Legacy photo directory {PhotoDirectory} is a link or junction; automatic cleanup was skipped",
            legacyPhotoDirectory.FullName);
    }
    else
    {
        try
        {
            legacyPhotoDirectory.Delete(recursive: true);
            app.Logger.LogInformation("Deleted legacy food-identification photos from {PhotoDirectory}", legacyPhotoDirectory.FullName);
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning(ex, "Could not delete legacy food-identification photos from {PhotoDirectory}", legacyPhotoDirectory.FullName);
        }
    }
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapFoodEndpoints();
app.MapEntryEndpoints();
app.MapRecipeEndpoints();
app.MapCheckinEndpoints();
app.MapMetricsEndpoints();
app.MapStatsEndpoints();
app.MapReportEndpoints();
app.MapUserEndpoints();

var spaRoutes = new[]
{
    "/today", "/meals", "/meals/new", "/drinks", "/recipes", "/ingredients", "/checkin",
    "/metrics", "/stats", "/preferences"
};
foreach (var route in spaRoutes)
{
    app.MapGet(route, () => Results.File(
        Path.Combine(app.Environment.WebRootPath, "index.html"),
        "text/html"
    )).AllowAnonymous();
}

app.MapGet("/meal", () => Results.Redirect("/today", permanent: true)).AllowAnonymous();

app.Run();
