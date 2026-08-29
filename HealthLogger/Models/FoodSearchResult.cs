namespace HealthLogger.Models;

public class FoodSearchResult
{
    public Guid Id { get; set; }
    public int? FineliId { get; set; }
    public string NameFi { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? Category { get; set; }
    public double DefaultPortionGrams { get; set; }
    public double? UnitWeightGrams { get; set; }
    public double EnergyKcal { get; set; }
    public double Protein { get; set; }
    public double Fat { get; set; }
    public double Carbohydrate { get; set; }
}
