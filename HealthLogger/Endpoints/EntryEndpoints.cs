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

        group.MapPost("/meal", async (CreateMealRequest request, HttpContext ctx,
            EntryRepository repo, FoodRepository foodRepo) =>
        {
            var mealTypes = new[] { "breakfast", "lunch", "snack", "dinner", "supper" };
            if (!mealTypes.Contains(request.MealType) || request.Items is null || request.Items.Count == 0 ||
                request.Items.Any(item => !double.IsFinite(item.PortionGrams) || item.PortionGrams <= 0 ||
                    (item.FoodItemId is null && (!item.CustomCalories.HasValue ||
                        !double.IsFinite(item.CustomCalories.Value) || item.CustomCalories.Value < 0)) ||
                    (item.FoodItemId is not null && item.CustomCalories is not null)))
                return Results.BadRequest();

            var userId = Guid.Parse(ctx.GetAppUserId());
            var items = new List<FoodEntryItemEntity>();
            foreach (var requestItem in request.Items)
            {
                FoodItemEntity? food = null;
                if (requestItem.FoodItemId is Guid foodItemId)
                {
                    food = await foodRepo.GetAccessibleByIdAsync(userId, foodItemId);
                    if (food is null) return Results.BadRequest();
                }
                items.Add(new FoodEntryItemEntity
                {
                    FoodItemId = requestItem.FoodItemId,
                    FoodItem = food,
                    PortionGrams = requestItem.PortionGrams,
                    CustomCalories = requestItem.CustomCalories,
                    Notes = requestItem.Notes
                });
            }

            var entry = new FoodEntryEntity
            {
                UserId = userId,
                EntryDate = request.EntryDate,
                ConsumptionTime = request.ConsumptionTime,
                MealType = request.MealType,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim()
            };
            var created = await repo.CreateMealAsync(entry, items);
            return Results.Created($"/api/entries/{created.Id}", created);
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateMealRequest request, HttpContext ctx, EntryRepository repo) =>
        {
            var mealTypes = new[] { "breakfast", "lunch", "snack", "dinner", "supper" };
            if (!mealTypes.Contains(request.MealType)) return Results.BadRequest();

            var updated = await repo.UpdateDetailsAsync(ctx.GetAppUserId(), id,
                request.EntryDate, request.ConsumptionTime, request.MealType, request.Notes);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
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
            if (request.PortionGrams <= 0) return Results.BadRequest();

            var updated = await repo.UpdateItemAsync(
                ctx.GetAppUserId(), entryId, itemId, request.PortionGrams);
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

public sealed record UpdateEntryItemRequest(double PortionGrams);
public sealed record UpdateMealRequest(DateOnly EntryDate, TimeOnly ConsumptionTime, string MealType, string? Notes);
public sealed record CreateMealItemRequest(Guid? FoodItemId, double PortionGrams, double? CustomCalories, string? Notes);
public sealed record CreateMealRequest(DateOnly EntryDate, TimeOnly ConsumptionTime, string MealType, string? Notes,
    List<CreateMealItemRequest> Items);
