namespace HealthLogger.Entities;

public class FoodItemEntity
{
    public Guid Id { get; set; }
    public int? FineliId { get; set; }
    public string? Barcode { get; set; }
    public string? BarcodeSource { get; set; }
    public string NameFi { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameSv { get; set; }
    public string? Category { get; set; }
    public double DefaultPortionGrams { get; set; } = 100;
    public double? UnitWeightGrams { get; set; }
    public double EnergyKcal { get; set; }
    public double EnergyKj { get; set; }
    public double Protein { get; set; }
    public double Fat { get; set; }
    public double? SaturatedFat { get; set; }
    public double Carbohydrate { get; set; }
    public double? Sugar { get; set; }
    public double? Fiber { get; set; }
    public double? Salt { get; set; }
    public bool IsUserCreated { get; set; }
    public Guid? UserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public UserEntity? User { get; set; }
    public List<FoodEntryItemEntity> EntryItems { get; set; } = [];
    public List<RecipeIngredientEntity> RecipeIngredients { get; set; } = [];
}
