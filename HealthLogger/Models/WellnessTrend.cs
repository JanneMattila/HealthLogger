namespace HealthLogger.Models;

public class WellnessTrend
{
    public DateOnly Date { get; set; }
    public int? SleepQuality { get; set; }
    public double? SleepHours { get; set; }
    public int? MoodRating { get; set; }
    public int? EnergyLevel { get; set; }
    public int? StressLevel { get; set; }
    public double? WaterIntakeLiters { get; set; }
    public bool? ExerciseDone { get; set; }
    public double? AlcoholUnits { get; set; }
    public int? StepCount { get; set; }
}
