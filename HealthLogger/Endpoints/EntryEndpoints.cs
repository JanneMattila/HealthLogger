using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;

namespace HealthLogger.Endpoints;

public static class EntryEndpoints
{
    public static void MapEntryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/entries").RequireAuthorization();

        group.MapGet("/", async (DateOnly? date, HttpContext ctx, EntryRepository repo) =>
        {
            var userId = ctx.GetAppUserId();
            var d = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var entries = await repo.GetByDateAsync(userId, d);
            return Results.Ok(entries);
        });

        group.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, EntryRepository repo) =>
        {
            var userId = ctx.GetAppUserId();
            var entry = await repo.GetByIdAsync(userId, id);
            return entry is null ? Results.NotFound() : Results.Ok(entry);
        });

        group.MapPost("/", async (FoodEntryEntity entry, HttpContext ctx, EntryRepository repo) =>
        {
            entry.UserId = Guid.Parse(ctx.GetAppUserId());
            var created = await repo.CreateAsync(entry);
            return Results.Created($"/api/entries/{created.Id}", created);
        });

        group.MapPut("/{id:guid}", async (Guid id, FoodEntryEntity entry, HttpContext ctx, EntryRepository repo) =>
        {
            var userId = ctx.GetAppUserId();
            var existing = await repo.GetByIdAsync(userId, id);
            if (existing is null) return Results.NotFound();

            entry.Id = id;
            entry.UserId = Guid.Parse(userId);
            var updated = await repo.UpdateAsync(entry);
            return Results.Ok(updated);
        });

        group.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, EntryRepository repo) =>
        {
            await repo.DeleteAsync(ctx.GetAppUserId(), id);
            return Results.NoContent();
        });

        group.MapPost("/{entryId:guid}/items", async (Guid entryId, FoodEntryItemEntity item, HttpContext ctx, EntryRepository repo) =>
        {
            var userId = ctx.GetAppUserId();
            var entry = await repo.GetByIdAsync(userId, entryId);
            if (entry is null) return Results.NotFound();

            var created = await repo.AddItemAsync(entryId, item);
            return Results.Created($"/api/entries/{entryId}/items/{created.Id}", created);
        });

        group.MapPut("/{entryId:guid}/items/{itemId:guid}", async (Guid entryId, Guid itemId,
            UpdateEntryItemRequest request, HttpContext ctx, EntryRepository repo) =>
        {
            var mealTypes = new[] { "breakfast", "lunch", "snack", "dinner", "supper" };
            if (request.PortionGrams <= 0 || !mealTypes.Contains(request.MealType))
                return Results.BadRequest();

            var updated = await repo.UpdateItemAsync(
                ctx.GetAppUserId(), entryId, itemId, request.PortionGrams, request.MealType);
            return updated is null
                ? Results.NotFound()
                : Results.Ok(new { updated.Id, updated.FoodEntryId, updated.PortionGrams });
        });

        group.MapDelete("/{entryId:guid}/items/{itemId:guid}", async (Guid entryId, Guid itemId, HttpContext ctx, EntryRepository repo) =>
        {
            await repo.RemoveItemAsync(ctx.GetAppUserId(), entryId, itemId);
            return Results.NoContent();
        });
    }
}

public sealed record UpdateEntryItemRequest(double PortionGrams, string MealType);
