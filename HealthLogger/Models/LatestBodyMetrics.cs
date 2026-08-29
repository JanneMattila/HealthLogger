namespace HealthLogger.Models;

public class LatestBodyMetrics
{
    public double? WeightKg { get; set; }
    public DateOnly? WeightMeasurementDate { get; set; }
    public double? WaistCircumferenceCm { get; set; }
    public DateOnly? WaistMeasurementDate { get; set; }
    public int? SystolicBP { get; set; }
    public DateOnly? SystolicBPMeasurementDate { get; set; }
    public int? DiastolicBP { get; set; }
    public DateOnly? DiastolicBPMeasurementDate { get; set; }
}