using HealthLogger.Data;
using HealthLogger.Entities;
using HealthLogger.Models;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class MetricsRepository
{
    private readonly HealthLoggerDbContext _db;

    public MetricsRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<List<BodyMetricEntity>> GetRangeAsync(string userId, DateOnly from, DateOnly to)
    {
        var id = Guid.Parse(userId);
        return await _db.BodyMetrics
            .Where(m => m.UserId == id && m.MeasurementDate >= from && m.MeasurementDate <= to)
            .OrderBy(m => m.MeasurementDate)
            .ToListAsync();
    }

    public async Task<LatestBodyMetrics?> GetLatestAsync(string userId)
    {
        var id = Guid.Parse(userId);
        var metrics = await _db.BodyMetrics
            .Where(m => m.UserId == id && (
                m.WeightKg.HasValue ||
                m.WaistCircumferenceCm.HasValue ||
                m.SystolicBP.HasValue ||
                m.DiastolicBP.HasValue
            ))
            .OrderByDescending(m => m.MeasurementDate)
            .ThenByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.WeightKg,
                m.WaistCircumferenceCm,
                m.SystolicBP,
                m.DiastolicBP,
                m.MeasurementDate
            })
            .ToListAsync();

        if (metrics.Count == 0) return null;

        var latestWeight = metrics.FirstOrDefault(m => m.WeightKg.HasValue);
        var latestWaist = metrics.FirstOrDefault(m => m.WaistCircumferenceCm.HasValue);
        var latestSystolic = metrics.FirstOrDefault(m => m.SystolicBP.HasValue);
        var latestDiastolic = metrics.FirstOrDefault(m => m.DiastolicBP.HasValue);

        return new LatestBodyMetrics
        {
            WeightKg = latestWeight?.WeightKg,
            WeightMeasurementDate = latestWeight?.MeasurementDate,
            WaistCircumferenceCm = latestWaist?.WaistCircumferenceCm,
            WaistMeasurementDate = latestWaist?.MeasurementDate,
            SystolicBP = latestSystolic?.SystolicBP,
            SystolicBPMeasurementDate = latestSystolic?.MeasurementDate,
            DiastolicBP = latestDiastolic?.DiastolicBP,
            DiastolicBPMeasurementDate = latestDiastolic?.MeasurementDate
        };
    }

    public async Task<BodyMetricEntity> CreateAsync(string userId, BodyMetricEntity metric)
    {
        metric.Id = Guid.NewGuid();
        metric.UserId = Guid.Parse(userId);
        metric.CreatedAt = DateTime.UtcNow;
        _db.BodyMetrics.Add(metric);
        await _db.SaveChangesAsync();
        return metric;
    }

    public async Task<BodyMetricEntity?> UpdateAsync(string userId, BodyMetricEntity metric)
    {
        var id = Guid.Parse(userId);
        var existing = await _db.BodyMetrics.AsTracking()
            .FirstOrDefaultAsync(m => m.Id == metric.Id && m.UserId == id);
        if (existing == null) return null;

        existing.WeightKg = metric.WeightKg;
        existing.WaistCircumferenceCm = metric.WaistCircumferenceCm;
        existing.SystolicBP = metric.SystolicBP;
        existing.DiastolicBP = metric.DiastolicBP;
        existing.Notes = metric.Notes;
        await _db.SaveChangesAsync();
        return existing;
    }

    public async Task DeleteAsync(string userId, Guid metricId)
    {
        var id = Guid.Parse(userId);
        var metric = await _db.BodyMetrics.AsTracking()
            .FirstOrDefaultAsync(m => m.Id == metricId && m.UserId == id);
        if (metric != null)
        {
            _db.BodyMetrics.Remove(metric);
            await _db.SaveChangesAsync();
        }
    }
}
