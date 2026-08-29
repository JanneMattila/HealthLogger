using HealthLogger.Entities;

namespace HealthLogger.Services;

public class NutritionCalculator
{
    public static double CalculateKilojoules(double kilocalories)
    {
        return kilocalories > 0 ? Math.Round(kilocalories * 4.184, 1) : 0;
    }

    public static double CalculateCalories(FoodItemEntity food, double portionGrams)
    {
        return food.EnergyKcal * portionGrams / 100.0;
    }

    public static double CalculateProtein(FoodItemEntity food, double portionGrams)
    {
        return food.Protein * portionGrams / 100.0;
    }

    public static double CalculateFat(FoodItemEntity food, double portionGrams)
    {
        return food.Fat * portionGrams / 100.0;
    }

    public static double CalculateCarbs(FoodItemEntity food, double portionGrams)
    {
        return food.Carbohydrate * portionGrams / 100.0;
    }

    public static (double calories, double protein, double fat, double carbs) CalculateAll(
        FoodItemEntity food, double portionGrams)
    {
        var ratio = portionGrams / 100.0;
        return (
            food.EnergyKcal * ratio,
            food.Protein * ratio,
            food.Fat * ratio,
            food.Carbohydrate * ratio
        );
    }
}
