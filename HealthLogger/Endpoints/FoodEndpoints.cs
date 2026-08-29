using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;
using HealthLogger.Services;
using System.Text.Json;

namespace HealthLogger.Endpoints;

public static class FoodEndpoints
{
    public static void MapFoodEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/foods").RequireAuthorization();

        group.MapGet("/", async (string? search, string? lang, int? limit, int? offset, FoodRepository repo, HttpContext ctx) =>
        {
            if (string.IsNullOrWhiteSpace(search))
                return Results.BadRequest("Search query required");

            var userId = Guid.Parse(ctx.GetAppUserId());
            var results = await repo.SearchAsync(userId, search, lang ?? "fi", limit ?? 20, offset ?? 0);
            return Results.Ok(results);
        });

        group.MapGet("/fineli/{fineliId:int}", async (int fineliId, FoodRepository repo) =>
        {
            var food = await repo.GetByFineliIdAsync(fineliId);
            return food is null ? Results.NotFound() : Results.Ok(food);
        });

        group.MapGet("/{id:guid}", async (Guid id, FoodRepository repo, HttpContext ctx) =>
        {
            var userId = Guid.Parse(ctx.GetAppUserId());
            var food = await repo.GetAccessibleByIdAsync(userId, id);
            return food is null ? Results.NotFound() : Results.Ok(food);
        });

        group.MapPatch("/{id:guid}/weights", async (Guid id, UpdateFoodWeightsRequest request, FoodRepository repo, HttpContext ctx) =>
        {
            if (request.DefaultPortionGrams <= 0 || request.UnitWeightGrams is <= 0)
                return Results.BadRequest("Weights must be greater than zero");

            var userId = Guid.Parse(ctx.GetAppUserId());
            var food = await repo.UpdateWeightsAsync(userId, id, request.DefaultPortionGrams, request.UnitWeightGrams);
            return food is null ? Results.NotFound() : Results.Ok(food);
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateCustomFoodRequest request, HttpContext ctx, FoodRepository repo) =>
        {
            var nameFi = request.NameFi?.Trim();
            var nameEn = request.NameEn?.Trim();
            if (string.IsNullOrWhiteSpace(nameFi) && string.IsNullOrWhiteSpace(nameEn))
                return Results.BadRequest("At least one ingredient name is required");
            if (!IsValidNutrition(request) || request.DefaultPortionGrams <= 0 || request.UnitWeightGrams is <= 0)
                return Results.BadRequest("Ingredient values must be valid non-negative numbers and weights must be greater than zero");

            var update = new FoodItemEntity
            {
                NameFi = nameFi ?? nameEn!,
                NameEn = nameEn ?? nameFi!,
                Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(),
                DefaultPortionGrams = request.DefaultPortionGrams,
                UnitWeightGrams = request.UnitWeightGrams,
                EnergyKcal = request.EnergyKcal,
                EnergyKj = request.EnergyKj,
                Protein = request.Protein,
                Fat = request.Fat,
                SaturatedFat = request.SaturatedFat,
                Carbohydrate = request.Carbohydrate,
                Sugar = request.Sugar,
                Fiber = request.Fiber,
                Salt = request.Salt
            };
            var userId = Guid.Parse(ctx.GetAppUserId());
            var updated = await repo.UpdateCustomFoodAsync(userId, id, update);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        });

        group.MapGet("/barcode/{barcode}", async (
            string barcode,
            HttpContext ctx,
            FoodRepository repo,
            BarcodeFoodLookupService lookup,
            CancellationToken cancellationToken) =>
        {
            var normalizedBarcode = barcode.Trim();
            var userId = Guid.Parse(ctx.GetAppUserId());
            var existing = await repo.GetByBarcodeAsync(userId, normalizedBarcode);
            if (existing is not null)
            {
                if (string.IsNullOrWhiteSpace(existing.BarcodeSource))
                {
                    var refreshed = await lookup.LookupAsync(normalizedBarcode, cancellationToken);
                    if (refreshed.Found)
                    {
                        ApplyBarcodeDetails(existing, refreshed);
                        await repo.SaveBarcodeDetailsAsync(existing);
                    }
                }
                return Results.Ok(BarcodeFoodLookupResult.FromExisting(existing, normalizedBarcode));
            }

            var result = await lookup.LookupAsync(normalizedBarcode, cancellationToken);
            if (result.Found)
            {
                var legacyFood = await repo.FindLegacyBarcodeCandidateAsync(userId, result.NameFi, result.NameEn);
                if (legacyFood is not null)
                {
                    ApplyBarcodeDetails(legacyFood, result);
                    await repo.SaveBarcodeDetailsAsync(legacyFood);
                    return Results.Ok(BarcodeFoodLookupResult.FromExisting(legacyFood, normalizedBarcode));
                }
            }

            return result.Error == "invalid_barcode" ? Results.BadRequest(result) : Results.Ok(result);
        });

        group.MapPost("/", async (FoodItemEntity food, HttpContext ctx, FoodRepository repo) =>
        {
            food.UserId = Guid.Parse(ctx.GetAppUserId());
            if (!string.IsNullOrWhiteSpace(food.Barcode) && string.IsNullOrWhiteSpace(food.Category))
                food.Category = "Own";
            var created = await repo.CreateCustomFoodAsync(food);
            return Results.Created($"/api/foods/{created.Id}", created);
        });

        group.MapGet("/search-online", async (string query, HealthLogger.Services.AiFoodRecognitionService aiService) =>
        {
            var result = await aiService.SearchNutritionOnlineAsync(query);
            return Results.Ok(result);
        });

        group.MapGet("/browse", async (string? category, string? lang, int? limit, int? offset, FoodRepository repo, HttpContext ctx) =>
        {
            ctx.Response.Headers.CacheControl = "private, no-store";
            var userId = Guid.Parse(ctx.GetAppUserId());
            var items = await repo.BrowseAsync(userId, category, lang ?? "en", limit ?? 50, offset ?? 0);
            return Results.Ok(items);
        });
        group.MapGet("/categories", async (FoodRepository repo, UserRepository userRepo, HttpContext ctx) =>
        {
            ctx.Response.Headers.CacheControl = "private, no-store";
            var userId = Guid.Parse(ctx.GetAppUserId());
            var categories = await repo.GetCategoriesAsync(userId);
            var preferences = await userRepo.GetOrCreatePreferencesAsync(userId.ToString());
            try
            {
                categories.AddRange(JsonSerializer.Deserialize<List<string>>(preferences.IngredientCategories) ?? []);
            }
            catch (JsonException)
            {
                // Keep categories already assigned to foods when preferences contain invalid legacy data.
            }
            categories.Add("Own");
            return Results.Ok(categories
                .Where(category => !string.IsNullOrWhiteSpace(category))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(category => category));
        });
    }

    private sealed record UpdateFoodWeightsRequest(double DefaultPortionGrams, double? UnitWeightGrams);

    private sealed record UpdateCustomFoodRequest(
        string? NameFi,
        string? NameEn,
        string? Category,
        double DefaultPortionGrams,
        double? UnitWeightGrams,
        double EnergyKcal,
        double EnergyKj,
        double Protein,
        double Fat,
        double? SaturatedFat,
        double Carbohydrate,
        double? Sugar,
        double? Fiber,
        double? Salt);

    private static bool IsValidNutrition(UpdateCustomFoodRequest request)
    {
        var requiredValues = new[]
        {
            request.DefaultPortionGrams,
            request.EnergyKcal,
            request.EnergyKj,
            request.Protein,
            request.Fat,
            request.Carbohydrate
        };
        var optionalValues = new[]
        {
            request.UnitWeightGrams,
            request.SaturatedFat,
            request.Sugar,
            request.Fiber,
            request.Salt
        };
        return requiredValues.All(value => double.IsFinite(value) && value >= 0)
            && optionalValues.All(value => !value.HasValue || double.IsFinite(value.Value) && value.Value >= 0);
    }

    private static void ApplyBarcodeDetails(FoodItemEntity food, BarcodeFoodLookupResult result)
    {
        food.Barcode = result.Barcode;
        food.BarcodeSource = result.Source;
        food.NameFi = result.NameFi ?? result.NameEn ?? food.NameFi;
        food.NameEn = result.NameEn ?? result.NameFi ?? food.NameEn;
        food.Category = result.Category;
        food.EnergyKcal = result.EnergyKcal;
        food.EnergyKj = result.EnergyKj;
        food.Protein = result.Protein;
        food.Fat = result.Fat;
        food.SaturatedFat = result.SaturatedFat;
        food.Carbohydrate = result.Carbohydrate;
        food.Sugar = result.Sugar;
        food.Fiber = result.Fiber;
        food.Salt = result.Salt;
    }
}
