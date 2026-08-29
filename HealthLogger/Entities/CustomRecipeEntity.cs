namespace HealthLogger.Entities;

public class CustomRecipeEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? NutritionMode { get; set; } // "per100g" or "perProduct"
    public double? ProductWeightG { get; set; } // total weight when mode is perProduct
    public double? CustomCalories { get; set; }
    public double? CustomCaloriesKj { get; set; }
    public double? CustomProtein { get; set; }
    public double? CustomFat { get; set; }
    public double? CustomSaturatedFat { get; set; }
    public double? CustomCarbohydrate { get; set; }
    public double? CustomSugar { get; set; }
    public double? CustomSalt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public UserEntity User { get; set; } = null!;
    public List<RecipeIngredientEntity> Ingredients { get; set; } = [];
}
