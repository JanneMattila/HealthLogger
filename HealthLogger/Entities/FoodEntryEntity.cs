namespace HealthLogger.Entities;

public class FoodEntryEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateOnly EntryDate { get; set; }
    public TimeOnly? ConsumptionTime { get; set; }
    public string MealType { get; set; } = string.Empty; // breakfast, lunch, dinner, snack
    public string? Notes { get; set; }
    public double TotalCalories { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public UserEntity User { get; set; } = null!;
    public List<FoodEntryItemEntity> Items { get; set; } = [];
}
