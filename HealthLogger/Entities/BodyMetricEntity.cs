namespace HealthLogger.Entities;

public class BodyMetricEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateOnly MeasurementDate { get; set; }
    public double? WeightKg { get; set; }
    public double? WaistCircumferenceCm { get; set; }
    public int? SystolicBP { get; set; }
    public int? DiastolicBP { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation
    public UserEntity User { get; set; } = null!;
}
