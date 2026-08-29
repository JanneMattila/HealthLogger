using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;

namespace HealthLogger.Endpoints;

public static class MetricsEndpoints
{
    public static void MapMetricsEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/metrics").RequireAuthorization();

        group.MapGet("/", async (DateOnly? from, DateOnly? to, HttpContext ctx, MetricsRepository repo) =>
        {
            var userId = ctx.GetAppUserId();
            var f = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3));
            var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var metrics = await repo.GetRangeAsync(userId, f, t);
            return Results.Ok(metrics);
        });

        group.MapGet("/latest", async (HttpContext ctx, MetricsRepository repo) =>
        {
            var latest = await repo.GetLatestAsync(ctx.GetAppUserId());
            return latest is null ? Results.NotFound() : Results.Ok(latest);
        });

        group.MapPost("/", async (BodyMetricEntity metric, HttpContext ctx, MetricsRepository repo) =>
        {
            var created = await repo.CreateAsync(ctx.GetAppUserId(), metric);
            return Results.Created($"/api/metrics/{created.Id}", created);
        });

        group.MapPut("/{id:guid}", async (Guid id, BodyMetricEntity metric, HttpContext ctx, MetricsRepository repo) =>
        {
            metric.Id = id;
            var updated = await repo.UpdateAsync(ctx.GetAppUserId(), metric);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        });

        group.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, MetricsRepository repo) =>
        {
            await repo.DeleteAsync(ctx.GetAppUserId(), id);
            return Results.NoContent();
        });
    }
}
