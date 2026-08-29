namespace HealthLogger.Models;

public class PhotoAnalysisResult
{
    public Guid PhotoId { get; set; }
    public List<IdentifiedFoodItem> IdentifiedItems { get; set; } = [];
    public string? RawAnalysis { get; set; }
    public string? ErrorMessage { get; set; }
    public int TotalEstimatedCalories => (int)IdentifiedItems.Sum(i => i.EstimatedCalories);
}

public class IdentifiedFoodItem
{
    public string NameFi { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public double EstimatedPortionGrams { get; set; }
    public double EstimatedCalories { get; set; }
    public Guid? MatchedFoodItemId { get; set; }
    public string? MatchedFoodName { get; set; }
    public double MatchConfidence { get; set; }

    // Fineli nutritional data (per 100g) from matched food item
    public double? FineliEnergyKcalPer100g { get; set; }
    public double? FineliProteinPer100g { get; set; }
    public double? FineliCarbsPer100g { get; set; }
    public double? FineliFatPer100g { get; set; }
}
