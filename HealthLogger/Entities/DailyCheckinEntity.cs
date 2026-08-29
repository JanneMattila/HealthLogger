namespace HealthLogger.Entities;

public class DailyCheckinEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateOnly CheckinDate { get; set; }
    public int? SleepQuality { get; set; } // 1-5
    public double? SleepHours { get; set; }
    public int? MoodRating { get; set; } // 1-5
    public int? EnergyLevel { get; set; } // 1-5
    public int? StressLevel { get; set; } // 1-5
    public double? WaterIntakeLiters { get; set; }
    public bool? ExerciseDone { get; set; }
    public string? ExerciseType { get; set; }
    public double? AlcoholUnits { get; set; }
    public int? StepCount { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public UserEntity User { get; set; } = null!;
}
