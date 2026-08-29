using HealthLogger.Data;
using HealthLogger.Entities;
using Microsoft.EntityFrameworkCore;

namespace HealthLogger.Repositories;

public class PhotoRepository
{
    private readonly HealthLoggerDbContext _db;

    public PhotoRepository(HealthLoggerDbContext db) => _db = db;

    public async Task<FoodPhotoEntity> CreateAsync(FoodPhotoEntity photo)
    {
        photo.Id = Guid.NewGuid();
        photo.CreatedAt = DateTime.UtcNow;
        _db.FoodPhotos.Add(photo);
        await _db.SaveChangesAsync();
        return photo;
    }

    public async Task<FoodPhotoEntity?> GetByIdAsync(string userId, Guid photoId)
    {
        var id = Guid.Parse(userId);
        return await _db.FoodPhotos
            .FirstOrDefaultAsync(p => p.Id == photoId && p.UserId == id);
    }

    public async Task UpdateAnalysisAsync(Guid photoId, string analysisJson, string identifiedItems)
    {
        var photo = await _db.FoodPhotos.AsTracking()
            .FirstOrDefaultAsync(p => p.Id == photoId);
        if (photo != null)
        {
            photo.AiAnalysisJson = analysisJson;
            photo.IdentifiedItems = identifiedItems;
            photo.AnalyzedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }

    public async Task LinkToEntryAsync(Guid photoId, Guid entryId)
    {
        var photo = await _db.FoodPhotos.AsTracking()
            .FirstOrDefaultAsync(p => p.Id == photoId);
        if (photo != null)
        {
            photo.FoodEntryId = entryId;
            await _db.SaveChangesAsync();
        }
    }
}
