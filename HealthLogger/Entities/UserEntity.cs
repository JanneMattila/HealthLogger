namespace HealthLogger.Entities;

public class UserEntity
{
    public Guid Id { get; set; }
    public string ExternalId { get; set; } = string.Empty;
    public string AuthType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsAdmin { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public List<FoodEntryEntity> FoodEntries { get; set; } = [];
    public List<CustomRecipeEntity> CustomRecipes { get; set; } = [];
    public List<DailyCheckinEntity> DailyCheckins { get; set; } = [];
    public List<BodyMetricEntity> BodyMetrics { get; set; } = [];
    public List<FoodPhotoEntity> FoodPhotos { get; set; } = [];
    public UserPreferencesEntity? Preferences { get; set; }
}
