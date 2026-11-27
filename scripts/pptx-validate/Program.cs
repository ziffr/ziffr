// Runs Microsoft's Open XML SDK validator over .pptx files, every part of them: slides, layouts, master and theme
// (spec 0069; GLOSSARY: Deck). A clean run is the closest check without PowerPoint; it does not promise that
// PowerPoint opens the file without a repair prompt. Usage: dotnet run --project scripts/pptx-validate -- <file or folder>...
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

var files = args.SelectMany(a => Directory.Exists(a) ? Directory.EnumerateFiles(a, "*.pptx", SearchOption.AllDirectories) : [a]).Order().ToList();
var validator = new OpenXmlValidator(FileFormatVersions.Microsoft365) { MaxNumberOfErrors = 200 };
var bad = 0;
foreach (var file in files)
{
    var errors = new List<string>();
    try
    {
        using var document = PresentationDocument.Open(file, false);
        errors.AddRange(validator.Validate(document).Select(e => $"{e.Part?.Uri} {e.Path?.XPath}: {e.Description}"));
    }
    catch (Exception e) { errors.Add(e.Message); }
    if (errors.Count > 0) bad++;
    Console.WriteLine($"{(errors.Count == 0 ? "ok  " : "FAIL")} {errors.Count,3}  {file}");
    foreach (var error in errors.Distinct().Take(20)) Console.WriteLine("      " + error);
}
Console.WriteLine($"{files.Count} files, {bad} with errors");
// No file at all is a failure too: the step that makes them broke.
return files.Count > 0 && bad == 0 ? 0 : 1;
