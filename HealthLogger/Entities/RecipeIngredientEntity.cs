namespace HealthLogger.Entities;

public class RecipeIngredientEntity
{
    public Guid Id { get; set; }
    public Guid RecipeId { get; set; }
    public Guid FoodItemId { get; set; }
    public double PortionGrams { get; set; }
    public int OrderIndex { get; set; }

    // Navigation
    public CustomRecipeEntity Recipe { get; set; } = null!;
    public FoodItemEntity FoodItem { get; set; } = null!;
}
