using HealthLogger.Extensions;
using HealthLogger.Repositories;
using HealthLogger.Services;
using System.Text.Json;

namespace HealthLogger.Endpoints;

public static class PhotoEndpoints
{
    private static readonly HashSet<string> AllowedContentTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    public static void MapPhotoEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/photos").RequireAuthorization();

        group.MapPost("/analyze", async (HttpContext ctx, PhotoRepository photoRepo, AiFoodRecognitionService aiService) =>
        {
            var userId = ctx.GetAppUserId();
            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("photo");

            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "No photo provided / Kuvaa ei annettu" });

            if (file.Length > MaxFileSizeBytes)
                return Results.BadRequest(new { error = "File too large. Maximum size is 10 MB. / Tiedosto on liian suuri. Maksimikoko on 10 Mt." });

            var contentType = file.ContentType ?? "image/jpeg";
            if (!AllowedContentTypes.Contains(contentType.ToLowerInvariant()))
                return Results.BadRequest(new { error = "Invalid file type. Only JPEG, PNG and WebP are supported. / Virheellinen tiedostotyyppi. Vain JPEG, PNG ja WebP ovat tuettuja." });

            // Read bytes into memory for both saving and AI analysis
            using var memStream = new MemoryStream();
            await file.CopyToAsync(memStream);
            var imageBytes = memStream.ToArray();

            // Save file to disk
            var photoDir = Path.Combine("data", "photos", userId);
            Directory.CreateDirectory(photoDir);
            var fileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
            var filePath = Path.Combine(photoDir, fileName);
            await File.WriteAllBytesAsync(filePath, imageBytes);

            // Save photo record
            var photo = await photoRepo.CreateAsync(new Entities.FoodPhotoEntity
            {
                UserId = Guid.Parse(userId),
                FileName = fileName,
                ContentType = contentType,
                FilePath = filePath
            });

            // Analyze with AI
            var result = await aiService.AnalyzeImageAsync(photo.Id, imageBytes, contentType);

            // Update photo record with analysis
            await photoRepo.UpdateAnalysisAsync(photo.Id,
                result.RawAnalysis ?? "",
                JsonSerializer.Serialize(result.IdentifiedItems));

            return Results.Ok(result);
        }).DisableAntiforgery();

        group.MapGet("/{id:guid}", async (Guid id, HttpContext ctx, PhotoRepository repo) =>
        {
            var photo = await repo.GetByIdAsync(ctx.GetAppUserId(), id);
            return photo is null ? Results.NotFound() : Results.Ok(photo);
        });

        group.MapPost("/{id:guid}/confirm/{entryId:guid}", async (Guid id, Guid entryId, HttpContext ctx, PhotoRepository repo) =>
        {
            await repo.LinkToEntryAsync(id, entryId);
            return Results.Ok();
        });
    }
}
