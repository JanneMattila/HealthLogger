namespace HealthLogger.Entities;

public class FoodEntryItemEntity
{
    public Guid Id { get; set; }
    public Guid FoodEntryId { get; set; }
    public Guid? FoodItemId { get; set; }
    public double PortionGrams { get; set; }
    public double? CustomCalories { get; set; }
    public string? Notes { get; set; }
    public Guid? SourceRecipeId { get; set; }
    public string? SourceRecipeName { get; set; }
    public Guid? RecipeInstanceId { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation
    public FoodEntryEntity FoodEntry { get; set; } = null!;
    public FoodItemEntity? FoodItem { get; set; }
}
