"""One-time download of public model files; never accepts or sends CV text."""
from fastembed import TextEmbedding
from semantic import MODEL_CACHE, MODEL_NAME


if __name__ == "__main__":
    print(f"Preparing {MODEL_NAME} in {MODEL_CACHE}")
    model = TextEmbedding(
        model_name=MODEL_NAME, cache_dir=str(MODEL_CACHE), threads=2,
        providers=["CPUExecutionProvider"],
    )
    vector = next(model.embed(["Synthetic model readiness check"]))
    print(f"Local model ready: {len(vector)} dimensions. Restart the backend if already running.")
