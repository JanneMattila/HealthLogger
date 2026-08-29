using HealthLogger.Extensions;
using HealthLogger.Services;

namespace HealthLogger.Endpoints;

public static class StatsEndpoints
{
    public static void MapStatsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/stats").RequireAuthorization();

        group.MapGet("/calories", async (DateOnly? from, DateOnly? to, HttpContext ctx, StatsService stats) =>
        {
            var userId = ctx.GetAppUserId();
            var f = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
            var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(await stats.GetCalorieTrendAsync(userId, f, t));
        });

        group.MapGet("/wellness", async (DateOnly? from, DateOnly? to, HttpContext ctx, StatsService stats) =>
        {
            var userId = ctx.GetAppUserId();
            var f = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
            var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(await stats.GetWellnessTrendAsync(userId, f, t));
        });

        group.MapGet("/macros", async (DateOnly? from, DateOnly? to, HttpContext ctx, StatsService stats) =>
        {
            var userId = ctx.GetAppUserId();
            var f = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
            var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(await stats.GetMacroDistributionAsync(userId, f, t));
        });

        group.MapGet("/dashboard", async (HttpContext ctx, StatsService stats) =>
        {
            return Results.Ok(await stats.GetDashboardAsync(ctx.GetAppUserId()));
        });
    }
}
