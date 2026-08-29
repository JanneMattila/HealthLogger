namespace HealthLogger.Entities;

public class UserPreferencesEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Language { get; set; } = "fi";
    public string Theme { get; set; } = "auto"; // light, dark, auto
    public int? DailyCalorieTarget { get; set; }
    public string DefaultMealTypes { get; set; } = "[\"breakfast\",\"lunch\",\"snack\",\"dinner\",\"supper\"]";
    public string IngredientCategories { get; set; } = "[\"Own\"]";
    public bool EnableNotifications { get; set; } = true;
    public string? ReminderTimes { get; set; } // JSON array
    public string? Sex { get; set; } // male, female
    public DateTime? DateOfBirth { get; set; }
    public double? HeightCm { get; set; }
    public string UnitSystem { get; set; } = "metric"; // metric, imperial
    public double? TargetWeightKg { get; set; }
    public double? TargetWaistCm { get; set; }
    public bool OutboundIntegrationEnabled { get; set; }
    public string? OutboundIntegrationUrl { get; set; }
    public bool InboundIntegrationEnabled { get; set; }
    public string? InboundIntegrationKey { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public UserEntity User { get; set; } = null!;
}
