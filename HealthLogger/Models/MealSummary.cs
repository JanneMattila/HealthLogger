namespace HealthLogger.Models;

public class MealSummary
{
    public Guid Id { get; set; }
    public string MealType { get; set; } = string.Empty;
    public DateOnly EntryDate { get; set; }
    public double TotalCalories { get; set; }
    public double TotalProtein { get; set; }
    public double TotalFat { get; set; }
    public double TotalCarbs { get; set; }
    public int ItemCount { get; set; }
    public string? Notes { get; set; }
    public List<MealItemDetail> Items { get; set; } = [];
}

public class MealItemDetail
{
    public Guid Id { get; set; }
    public Guid FoodItemId { get; set; }
    public string FoodName { get; set; } = string.Empty;
    public double PortionGrams { get; set; }
    public double Calories { get; set; }
    public double Protein { get; set; }
    public double Fat { get; set; }
    public double Carbs { get; set; }
}
