namespace HealthLogger.Entities;

public class FoodPhotoEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? FoodEntryId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public string? AiAnalysisJson { get; set; }
    public string? IdentifiedItems { get; set; } // JSON array
    public DateTime? AnalyzedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation
    public UserEntity User { get; set; } = null!;
    public FoodEntryEntity? FoodEntry { get; set; }
}
