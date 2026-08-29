using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;

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
    }
}
