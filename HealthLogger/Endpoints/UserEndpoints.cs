using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;
using HealthLogger.Services;
using System.Text.Json;

namespace HealthLogger.Endpoints;

public static class UserEndpoints
{
    public static void MapUserEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/user").RequireAuthorization();

        group.MapGet("/preferences", async (HttpContext ctx, UserRepository repo) =>
        {
            var prefs = await repo.GetOrCreatePreferencesAsync(ctx.GetAppUserId());
            return Results.Ok(prefs);
        });

        group.MapPut("/preferences", async (UserPreferencesEntity prefs, HttpContext ctx, UserRepository repo) =>
        {
            var existing = await repo.GetOrCreatePreferencesAsync(ctx.GetAppUserId());
            existing.Language = prefs.Language;
            existing.Theme = prefs.Theme;
            existing.DailyCalorieTarget = prefs.DailyCalorieTarget;
            existing.DefaultMealTypes = prefs.DefaultMealTypes;
            existing.IngredientCategories = prefs.IngredientCategories;
            existing.EnableNotifications = prefs.EnableNotifications;
            existing.ReminderTimes = prefs.ReminderTimes;
            existing.Sex = prefs.Sex;
            existing.DateOfBirth = prefs.DateOfBirth;
            existing.HeightCm = prefs.HeightCm;
            existing.UnitSystem = prefs.UnitSystem;
            existing.TargetWeightKg = prefs.TargetWeightKg;
            existing.TargetWaistCm = prefs.TargetWaistCm;
            await repo.UpdatePreferencesAsync(existing);
            return Results.Ok(existing);
        });

        group.MapGet("/favorites", async (HttpContext ctx, UserRepository repo, FavoritesVersionCache versionCache) =>
        {
            var userId = Guid.Parse(ctx.GetAppUserId());
            var (version, favorites) = await repo.GetFavoritesAsync(userId);
            versionCache.Set(userId, version);

            var etag = $"\"{version}\"";
            ctx.Response.Headers[FavoritesVersionCache.HeaderName] = version.ToString();
            ctx.Response.Headers.ETag = etag;
            ctx.Response.Headers.CacheControl = "private, no-cache";
            if (ctx.Request.Headers.IfNoneMatch.Contains(etag))
                return Results.StatusCode(StatusCodes.Status304NotModified);

            return Results.Text($"{{\"version\":{version},\"favorites\":{favorites}}}", "application/json");
        });

        group.MapPut("/favorites", async (SaveFavoritesRequest request, HttpContext ctx,
            UserRepository repo, FavoritesVersionCache versionCache) =>
        {
            if (!TryNormalizeFavorites(request.Favorites, out var favoritesJson))
                return Results.BadRequest(new { error = "Favorites must be an array of objects with a non-empty string id." });

            var userId = Guid.Parse(ctx.GetAppUserId());
            var version = await repo.SaveFavoritesAsync(userId, favoritesJson);
            versionCache.Set(userId, version);
            ctx.Response.Headers[FavoritesVersionCache.HeaderName] = version.ToString();
            return Results.Ok(new { version });
        });
    }

    private const int MaxFavorites = 1000;
    private const int MaxFavoritesJsonLength = 256 * 1024;

    private static bool TryNormalizeFavorites(JsonElement favorites, out string json)
    {
        json = "[]";
        if (favorites.ValueKind != JsonValueKind.Array || favorites.GetArrayLength() > MaxFavorites)
            return false;

        foreach (var item in favorites.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object
                || !item.TryGetProperty("id", out var id)
                || id.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(id.GetString()))
                return false;
        }

        json = favorites.GetRawText();
        return json.Length <= MaxFavoritesJsonLength;
    }
}

public record SaveFavoritesRequest(JsonElement Favorites);
