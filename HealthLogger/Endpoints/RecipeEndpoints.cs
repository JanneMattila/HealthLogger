using HealthLogger.Entities;
using HealthLogger.Extensions;
using HealthLogger.Repositories;

namespace HealthLogger.Endpoints;

public static class RecipeEndpoints
{
    public static void MapRecipeEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/recipes").RequireAuthorization();

        group.MapGet("/", async (HttpContext ctx, RecipeRepository repo) =>
        {
            var recipes = await repo.GetAllAsync(ctx.GetAppUserId());
            return Results.Ok(recipes);
        });

        group.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, RecipeRepository repo) =>
        {
            var recipe = await repo.GetByIdAsync(ctx.GetAppUserId(), id);
            return recipe is null ? Results.NotFound() : Results.Ok(recipe);
        });

        group.MapPost("/", async (CustomRecipeEntity recipe, HttpContext ctx, RecipeRepository repo) =>
        {
            recipe.UserId = Guid.Parse(ctx.GetAppUserId());
            var created = await repo.CreateAsync(recipe);
            return Results.Created($"/api/recipes/{created.Id}", created);
        });

        group.MapPut("/{id:guid}", async (Guid id, CustomRecipeEntity recipe, HttpContext ctx, RecipeRepository repo) =>
        {
            var updated = await repo.UpdateAsync(ctx.GetAppUserId(), id, recipe);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        });

        group.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, RecipeRepository repo) =>
        {
            await repo.DeleteAsync(ctx.GetAppUserId(), id);
            return Results.NoContent();
        });

        group.MapPost("/{recipeId:guid}/meal", async (Guid recipeId, CreateRecipeMealRequest request,
            HttpContext ctx, RecipeRepository recipeRepo, EntryRepository entryRepo) =>
        {
            var mealTypes = new[] { "breakfast", "lunch", "snack", "dinner", "supper" };
            if (!mealTypes.Contains(request.MealType)) return Results.BadRequest();

            var userId = ctx.GetAppUserId();
            var recipe = await recipeRepo.GetByIdAsync(userId, recipeId);
            if (recipe is null) return Results.NotFound();

            var recipeInstanceId = Guid.NewGuid();
            var items = new List<FoodEntryItemEntity>();
            if (recipe.Ingredients.Count > 0)
            {
                var totalRecipeGrams = recipe.Ingredients.Sum(ingredient => ingredient.PortionGrams);
                var multiplier = request.PortionMultiplier
                    ?? (request.PortionGrams.HasValue && totalRecipeGrams > 0
                        ? request.PortionGrams.Value / totalRecipeGrams
                        : 1.0);
                if (!double.IsFinite(multiplier) || multiplier <= 0)
                    return Results.BadRequest();

                items.AddRange(recipe.Ingredients.Select(ingredient => new FoodEntryItemEntity
                {
                    FoodItemId = ingredient.FoodItemId,
                    FoodItem = ingredient.FoodItem,
                    PortionGrams = ingredient.PortionGrams * multiplier,
                    SourceRecipeId = recipe.Id,
                    SourceRecipeName = recipe.Name,
                    RecipeInstanceId = recipeInstanceId
                }));
            }
            else if (recipe.CustomCalories.HasValue)
            {
                double calories;
                double recordedGrams;
                if (recipe.NutritionMode == "per100g")
                {
                    recordedGrams = request.PortionGrams ?? 100 * (request.PortionMultiplier ?? 1.0);
                    calories = recipe.CustomCalories.Value * recordedGrams / 100;
                }
                else if (recipe.NutritionMode == "perProduct")
                {
                    var multiplier = request.PortionMultiplier
                        ?? (request.PortionGrams.HasValue && recipe.ProductWeightG > 0
                            ? request.PortionGrams.Value / recipe.ProductWeightG.Value
                            : 1.0);
                    recordedGrams = request.PortionGrams ?? (recipe.ProductWeightG ?? 1) * multiplier;
                    calories = recipe.CustomCalories.Value * multiplier;
                }
                else
                {
                    recordedGrams = request.PortionGrams ?? request.PortionMultiplier ?? 1.0;
                    calories = recipe.CustomCalories.Value;
                }

                if (!double.IsFinite(recordedGrams) || recordedGrams <= 0 ||
                    !double.IsFinite(calories) || calories < 0)
                    return Results.BadRequest();

                items.Add(new FoodEntryItemEntity
                {
                    PortionGrams = recordedGrams,
                    CustomCalories = calories,
                    Notes = recipe.Name,
                    SourceRecipeId = recipe.Id,
                    SourceRecipeName = recipe.Name,
                    RecipeInstanceId = recipeInstanceId
                });
            }
            else
            {
                return Results.BadRequest();
            }

            var entry = new FoodEntryEntity
            {
                UserId = Guid.Parse(userId),
                EntryDate = request.EntryDate,
                ConsumptionTime = request.ConsumptionTime,
                MealType = request.MealType
            };
            var created = await entryRepo.CreateMealAsync(entry, items);
            return Results.Created($"/api/entries/{created.Id}", created);
        });

        // Add recipe to a meal entry with optional portion
        group.MapPost("/add-to-entry/{entryId:guid}/{recipeId:guid}", async (
            Guid entryId, Guid recipeId, double? portionGrams, double? portionMultiplier,
            HttpContext ctx, RecipeRepository recipeRepo, EntryRepository entryRepo) =>
        {
            var userId = ctx.GetAppUserId();
            var recipe = await recipeRepo.GetByIdAsync(userId, recipeId);
            if (recipe is null) return Results.NotFound("Recipe not found");

            var entry = await entryRepo.GetByIdAsync(userId, entryId);
            if (entry is null) return Results.NotFound("Entry not found");
            var recipeInstanceId = Guid.NewGuid();

            if (recipe.Ingredients.Count > 0)
            {
                var totalRecipeGrams = recipe.Ingredients.Sum(ingredient => ingredient.PortionGrams);
                var multiplier = portionMultiplier
                    ?? (portionGrams.HasValue && totalRecipeGrams > 0
                        ? portionGrams.Value / totalRecipeGrams
                        : 1.0);
                if (!double.IsFinite(multiplier) || multiplier <= 0)
                    return Results.BadRequest("Recipe portion must be greater than zero");

                foreach (var ingredient in recipe.Ingredients)
                {
                    await entryRepo.AddItemAsync(entryId, new FoodEntryItemEntity
                    {
                        FoodItemId = ingredient.FoodItemId,
                        PortionGrams = ingredient.PortionGrams * multiplier,
                        SourceRecipeId = recipe.Id,
                        SourceRecipeName = recipe.Name,
                        RecipeInstanceId = recipeInstanceId
                    });
                }
            }
            else if (recipe.CustomCalories.HasValue)
            {
                double calories;
                double recordedGrams;
                if (recipe.NutritionMode == "per100g")
                {
                    recordedGrams = portionGrams ?? 100 * (portionMultiplier ?? 1.0);
                    calories = recipe.CustomCalories.Value * recordedGrams / 100;
                }
                else if (recipe.NutritionMode == "perProduct")
                {
                    var multiplier = portionMultiplier
                        ?? (portionGrams.HasValue && recipe.ProductWeightG > 0
                            ? portionGrams.Value / recipe.ProductWeightG.Value
                            : 1.0);
                    recordedGrams = portionGrams ?? (recipe.ProductWeightG ?? 1) * multiplier;
                    calories = recipe.CustomCalories.Value * multiplier;
                }
                else
                {
                    recordedGrams = portionGrams ?? portionMultiplier ?? 1.0;
                    calories = recipe.CustomCalories.Value;
                }

                if (!double.IsFinite(recordedGrams) || recordedGrams <= 0 || !double.IsFinite(calories))
                    return Results.BadRequest("Recipe portion must be greater than zero");

                await entryRepo.AddItemAsync(entryId, new FoodEntryItemEntity
                {
                    PortionGrams = recordedGrams,
                    CustomCalories = calories,
                    SourceRecipeId = recipe.Id,
                    SourceRecipeName = recipe.Name,
                    RecipeInstanceId = recipeInstanceId
                });
            }

            return Results.NoContent();
        });
    }
}

public sealed record CreateRecipeMealRequest(DateOnly EntryDate, TimeOnly ConsumptionTime, string MealType,
    double? PortionGrams, double? PortionMultiplier);
