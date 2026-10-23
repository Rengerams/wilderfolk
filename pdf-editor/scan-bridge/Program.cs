// PDF Studio scan bridge — minimal ASP.NET Core service exposing NAPS2 scanning over HTTP.
// Reference implementation for the contract in README.md. Requires the .NET SDK, Windows and a scanner.
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using NAPS2.Images.Gdi;
using NAPS2.Ocr;
using NAPS2.Pdf;
using NAPS2.Scan;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    // The editor runs in a browser tab, so the bridge must accept that origin.
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});
var app = builder.Build();
app.UseCors();

var scanningContext = new ScanningContext(new GdiImageContext());
var controller = new ScanController(scanningContext);

app.MapGet("/devices", async () =>
{
    var devices = await controller.GetDeviceList();
    return Results.Json(new
    {
        devices = devices.Select((device, index) => new
        {
            id = index.ToString(),
            name = device.Name,
            driver = device.Driver.ToString(),
        }),
    });
});

app.MapPost("/scan", async (HttpRequest request) =>
{
    var options = await JsonSerializer.DeserializeAsync<ScanRequest>(
        request.Body,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    if (options is null) return Results.BadRequest(new { error = "Missing scan options." });

    var devices = await controller.GetDeviceList();
    if (devices.Count == 0) return Results.Json(new { error = "No scanner found on this PC." }, statusCode: 503);

    var device = int.TryParse(options.DeviceId, out var index) && index >= 0 && index < devices.Count
        ? devices[index]
        : devices[0];

    var scanOptions = new ScanOptions
    {
        Device = device,
        PaperSource = options.PaperSource == "flatbed" ? PaperSource.Flatbed : PaperSource.Feeder,
        PageSize = MapPageSize(options.PageSize),
        Dpi = options.Dpi,
        // true shows the scanner's own window and gives the user control over that run.
        ShowNativeUI = options.ShowNativeUI,
    };

    var images = new List<NAPS2.Images.ProcessedImage>();
    await foreach (var image in controller.Scan(scanOptions)) images.Add(image);
    if (images.Count == 0) return Results.Json(new { error = "The scanner returned no pages." }, statusCode: 502);

    var pages = new List<object>();
    foreach (var image in images)
    {
        using var memory = new MemoryStream();
        image.Save(memory, NAPS2.Images.ImageFileFormat.Png);
        pages.Add(new
        {
            dataUrl = "data:image/png;base64," + Convert.ToBase64String(memory.ToArray()),
            mime = "image/png",
        });
        image.Dispose();
    }
    return Results.Json(new { pages });
});

// Scanner-side OCR to a searchable PDF, for deployments that want it done on the Windows machine.
app.MapPost("/scan-pdf", async (HttpRequest request) =>
{
    var options = await JsonSerializer.DeserializeAsync<ScanRequest>(
        request.Body,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    if (options is null) return Results.BadRequest(new { error = "Missing scan options." });

    var devices = await controller.GetDeviceList();
    if (devices.Count == 0) return Results.Json(new { error = "No scanner found on this PC." }, statusCode: 503);

    var scanOptions = new ScanOptions
    {
        Device = devices[0],
        PaperSource = options.PaperSource == "flatbed" ? PaperSource.Flatbed : PaperSource.Feeder,
        PageSize = MapPageSize(options.PageSize),
        Dpi = options.Dpi,
        ShowNativeUI = options.ShowNativeUI,
    };
    var images = new List<NAPS2.Images.ProcessedImage>();
    await foreach (var image in controller.Scan(scanOptions)) images.Add(image);

    var path = Path.Combine(Path.GetTempPath(), $"pdf-studio-{Guid.NewGuid():N}.pdf");
    var exporter = new PdfExporter(scanningContext);
    var ocrParams = new OcrParameters { Languages = options.Languages.Length > 0 ? options.Languages : new[] { "nld" } };
    await exporter.Export(path, images, ocrParams);
    foreach (var image in images) image.Dispose();

    var bytes = await File.ReadAllBytesAsync(path);
    File.Delete(path);
    return Results.Json(new
    {
        dataUrl = "data:application/pdf;base64," + Convert.ToBase64String(bytes),
        mime = "application/pdf",
    });
});

app.Run("http://127.0.0.1:8765");

static PageSize MapPageSize(string? name) => name switch
{
    "a5" => PageSize.A5,
    "letter" => PageSize.Letter,
    "legal" => PageSize.Legal,
    _ => PageSize.A4,
};

internal sealed class ScanRequest
{
    public string? DeviceId { get; set; }
    public string PaperSource { get; set; } = "feeder";
    public string? PageSize { get; set; }
    public int Dpi { get; set; } = 300;
    public bool ShowNativeUI { get; set; } = true;
    public string[] Languages { get; set; } = Array.Empty<string>();
}
