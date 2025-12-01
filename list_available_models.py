"""
List Available Vertex AI Models

This script lists all available models in the specified region.
"""

import os
from dotenv import load_dotenv

load_dotenv()

def list_models():
    """List all available models"""
    print("=" * 80)
    print("LISTING AVAILABLE VERTEX AI MODELS")
    print("=" * 80)

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("VERTEX_AI_LOCATION")

    print(f"\nProject: {project}")
    print(f"Location: {location}")

    try:
        from google.cloud import aiplatform

        print("\nInitializing AI Platform...")
        aiplatform.init(project=project, location=location)

        print("\nListing available models...")

        # Try to list models using the Model class
        try:
            models = aiplatform.Model.list()
            print(f"\nFound {len(models)} models:")
            for model in models:
                print(f"  - {model.display_name} ({model.name})")
        except Exception as e:
            print(f"Could not list models via Model.list(): {e}")

        # Try listing publisher models
        print("\nTrying to check Vertex AI API access...")
        print("If you see a 403 or 404 error, you need to:")
        print("  1. Enable Vertex AI API at: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com")
        print("  2. Wait 2-5 minutes for API to be fully enabled")
        print("  3. Ensure service account has 'Vertex AI User' role")

        # Alternative: try a direct API call to check if API is enabled
        from google.cloud import aiplatform_v1

        client = aiplatform_v1.ModelServiceClient(
            client_options={"api_endpoint": f"{location}-aiplatform.googleapis.com"}
        )

        parent = f"projects/{project}/locations/{location}"
        print(f"\nChecking models at: {parent}")

        try:
            request = aiplatform_v1.ListModelsRequest(parent=parent)
            page_result = client.list_models(request=request)

            print("\nAvailable models:")
            count = 0
            for model in page_result:
                print(f"  - {model.display_name}")
                count += 1
                if count >= 10:
                    print("  ... (showing first 10)")
                    break

            if count == 0:
                print("  No models found. This might be normal for publisher models.")

        except Exception as e:
            print(f"\n[ERROR] API call failed: {e}")
            print("\nThis likely means:")
            print("  1. Vertex AI API is not enabled for this project")
            print("  2. Service account lacks necessary permissions")
            print("\nPlease visit: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=a64core")

    except ImportError as e:
        print(f"[ERROR] Import failed: {e}")
        print("Run: pip install google-cloud-aiplatform")
        return False
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

    print("\n" + "=" * 80)

if __name__ == "__main__":
    list_models()
