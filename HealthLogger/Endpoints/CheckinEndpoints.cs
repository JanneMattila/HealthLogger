using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;

namespace HealthLogger.Endpoints;

public static class CheckinEndpoints
{
    public static void MapCheckinEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/checkins").RequireAuthorization();

        group.MapGet("/", async (DateOnly? date, DateOnly? from, DateOnly? to, HttpContext ctx, CheckinRepository repo) =>
        {
            var userId = ctx.GetAppUserId();

            if (date.HasValue)
            {
                var checkin = await repo.GetByDateAsync(userId, date.Value);
                return checkin is null ? Results.NotFound() : Results.Ok(checkin);
            }

            if (from.HasValue && to.HasValue)
            {
                var checkins = await repo.GetRangeAsync(userId, from.Value, to.Value);
                return Results.Ok(checkins);
            }

            // Default: today
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var todayCheckin = await repo.GetByDateAsync(userId, today);
            return todayCheckin is null ? Results.NotFound() : Results.Ok(todayCheckin);
        });

        group.MapPost("/", async (DailyCheckinEntity checkin, HttpContext ctx, CheckinRepository repo) =>
        {
            var result = await repo.CreateOrUpdateAsync(ctx.GetAppUserId(), checkin);
            return Results.Ok(result);
        });

        group.MapPut("/{id:guid}", async (Guid id, DailyCheckinEntity checkin, HttpContext ctx, CheckinRepository repo) =>
        {
            checkin.Id = id;
            var result = await repo.CreateOrUpdateAsync(ctx.GetAppUserId(), checkin);
            return Results.Ok(result);
        });
    }
}
