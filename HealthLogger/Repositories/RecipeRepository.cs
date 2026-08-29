using HealthLogger.Data;
using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class RecipeRepository
{
    private readonly HealthLoggerDbContext _db;

    public RecipeRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<List<CustomRecipeEntity>> GetAllAsync(string userId)
    {
        var id = Guid.Parse(userId);
        return await _db.CustomRecipes
            .Include(r => r.Ingredients).ThenInclude(i => i.FoodItem)
            .Where(r => r.UserId == id)
            .OrderBy(r => r.Name)
            .ToListAsync();
    }

    public async Task<CustomRecipeEntity?> GetByIdAsync(string userId, Guid recipeId)
    {
        var id = Guid.Parse(userId);
        return await _db.CustomRecipes
            .Include(r => r.Ingredients).ThenInclude(i => i.FoodItem)
            .FirstOrDefaultAsync(r => r.Id == recipeId && r.UserId == id);
    }

    public async Task<CustomRecipeEntity> CreateAsync(CustomRecipeEntity recipe)
    {
        recipe.Id = Guid.NewGuid();
        recipe.CreatedAt = DateTime.UtcNow;
        foreach (var ing in recipe.Ingredients)
            ing.Id = Guid.NewGuid();
        _db.CustomRecipes.Add(recipe);
        await _db.SaveChangesAsync();
        return recipe;
    }

    public async Task<CustomRecipeEntity?> UpdateAsync(string userId, Guid recipeId, CustomRecipeEntity update)
    {
        var id = Guid.Parse(userId);
        var recipe = await _db.CustomRecipes
            .Include(existing => existing.Ingredients)
            .FirstOrDefaultAsync(existing => existing.Id == recipeId && existing.UserId == id);
        if (recipe is null) return null;

        recipe.Name = update.Name;
        recipe.Description = update.Description;
        recipe.NutritionMode = update.NutritionMode;
        recipe.ProductWeightG = update.ProductWeightG;
        recipe.CustomCalories = update.CustomCalories;
        recipe.CustomCaloriesKj = update.CustomCaloriesKj;
        recipe.CustomProtein = update.CustomProtein;
        recipe.CustomFat = update.CustomFat;
        recipe.CustomSaturatedFat = update.CustomSaturatedFat;
        recipe.CustomCarbohydrate = update.CustomCarbohydrate;
        recipe.CustomSugar = update.CustomSugar;
        recipe.CustomSalt = update.CustomSalt;
        recipe.UpdatedAt = DateTime.UtcNow;

        _db.RecipeIngredients.RemoveRange(recipe.Ingredients);
        var newIngredients = update.Ingredients.Select((ingredient, index) => new RecipeIngredientEntity
        {
            Id = Guid.NewGuid(),
            RecipeId = recipe.Id,
            FoodItemId = ingredient.FoodItemId,
            PortionGrams = ingredient.PortionGrams,
            OrderIndex = index
        }).ToList();
        _db.RecipeIngredients.AddRange(newIngredients);
        recipe.Ingredients = newIngredients;

        await _db.SaveChangesAsync();
        return recipe;
    }

    public async Task DeleteAsync(string userId, Guid recipeId)
    {
        var id = Guid.Parse(userId);
        var recipe = await _db.CustomRecipes.AsTracking()
            .FirstOrDefaultAsync(r => r.Id == recipeId && r.UserId == id);
        if (recipe != null)
        {
            _db.CustomRecipes.Remove(recipe);
            await _db.SaveChangesAsync();
        }
    }
}
