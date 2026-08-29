using HealthLogger.Data;
using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class UserRepository
{
    private readonly HealthLoggerDbContext _db;

    public UserRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<string> GetOrCreateAppUserIdAsync(string externalId, string name)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.ExternalId == externalId);
        if (user != null)
            return user.Id.ToString();

        user = new UserEntity
        {
            Id = Guid.NewGuid(),
            ExternalId = externalId,
            AuthType = "EntraID",
            Name = name,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user.Id.ToString();
    }

    public async Task<UserEntity?> GetUserAsync(string userId)
    {
        if (!Guid.TryParse(userId, out var id)) return null;
        return await _db.Users.AsTracking().FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task<UserPreferencesEntity> GetOrCreatePreferencesAsync(string userId)
    {
        var id = Guid.Parse(userId);
        var prefs = await _db.UserPreferences.AsTracking().FirstOrDefaultAsync(p => p.UserId == id);
        if (prefs != null) return prefs;

        prefs = new UserPreferencesEntity
        {
            Id = Guid.NewGuid(),
            UserId = id,
            CreatedAt = DateTime.UtcNow
        };
        _db.UserPreferences.Add(prefs);
        await _db.SaveChangesAsync();
        return prefs;
    }

    public async Task UpdatePreferencesAsync(UserPreferencesEntity preferences)
    {
        preferences.UpdatedAt = DateTime.UtcNow;
        _db.UserPreferences.Update(preferences);
        await _db.SaveChangesAsync();
    }
}
