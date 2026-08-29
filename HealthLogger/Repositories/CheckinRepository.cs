using HealthLogger.Data;
using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class CheckinRepository
{
    private readonly HealthLoggerDbContext _db;

    public CheckinRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<DailyCheckinEntity?> GetByDateAsync(string userId, DateOnly date)
    {
        var id = Guid.Parse(userId);
        return await _db.DailyCheckins
            .FirstOrDefaultAsync(c => c.UserId == id && c.CheckinDate == date);
    }

    public async Task<List<DailyCheckinEntity>> GetRangeAsync(string userId, DateOnly from, DateOnly to)
    {
        var id = Guid.Parse(userId);
        return await _db.DailyCheckins
            .Where(c => c.UserId == id && c.CheckinDate >= from && c.CheckinDate <= to)
            .OrderBy(c => c.CheckinDate)
            .ToListAsync();
    }

    public async Task<DailyCheckinEntity> CreateOrUpdateAsync(string userId, DailyCheckinEntity checkin)
    {
        var id = Guid.Parse(userId);
        var existing = await _db.DailyCheckins.AsTracking()
            .FirstOrDefaultAsync(c => c.UserId == id && c.CheckinDate == checkin.CheckinDate);

        if (existing != null)
        {
            existing.SleepQuality = checkin.SleepQuality;
            existing.SleepHours = checkin.SleepHours;
            existing.MoodRating = checkin.MoodRating;
            existing.EnergyLevel = checkin.EnergyLevel;
            existing.StressLevel = checkin.StressLevel;
            existing.Notes = checkin.Notes;
            existing.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return existing;
        }

        checkin.Id = Guid.NewGuid();
        checkin.UserId = id;
        checkin.CreatedAt = DateTime.UtcNow;
        _db.DailyCheckins.Add(checkin);
        await _db.SaveChangesAsync();
        return checkin;
    }
}
