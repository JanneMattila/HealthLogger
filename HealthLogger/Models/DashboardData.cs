namespace HealthLogger.Models;

public class DashboardData
{
    public DateOnly Date { get; set; }
    public double CaloriesToday { get; set; }
    public int? CalorieTarget { get; set; }
    public double ProteinToday { get; set; }
    public double FatToday { get; set; }
    public double CarbsToday { get; set; }
    public int MealsLogged { get; set; }
    public DailyCheckinSummary? TodayCheckin { get; set; }
    public BodyMetricSummary? LatestMetrics { get; set; }
    public List<CalorieTrendPoint> WeeklyCalorieTrend { get; set; } = [];
}

public class DailyCheckinSummary
{
    public int? SleepQuality { get; set; }
    public double? SleepHours { get; set; }
    public int? MoodRating { get; set; }
    public int? EnergyLevel { get; set; }
    public int? StressLevel { get; set; }
}

public class BodyMetricSummary
{
    public DateOnly Date { get; set; }
    public double? WeightKg { get; set; }
    public double? WaistCircumferenceCm { get; set; }
}

public class CalorieTrendPoint
{
    public DateOnly Date { get; set; }
    public double Calories { get; set; }
}
