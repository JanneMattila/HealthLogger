namespace HealthLogger.Models;

public class NutrientBreakdown
{
    public DateOnly Date { get; set; }
    public double TotalCalories { get; set; }
    public double Protein { get; set; }
    public double Fat { get; set; }
    public double Carbohydrate { get; set; }
    public double? Fiber { get; set; }
    public double? Sugar { get; set; }
    public double? SaturatedFat { get; set; }
    public double? Salt { get; set; }
}
