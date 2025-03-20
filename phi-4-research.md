I'll research how to leverage Hugging Face and Vertex AI to create your own Phi-4 API endpoint for speaker diarization. Let me explore the options available and provide a detailed implementation plan.Based on my research, I'll outline how to leverage Hugging Face and Vertex AI to create your own Phi-4 API endpoint for speaker diarization. This approach will give you more control over the model deployment and potentially reduce costs compared to using Microsoft's API directly.

## Setting Up Your Own Phi-4 API Endpoint

### 1. Google Cloud Vertex AI Setup

First, you'll need to set up Google Cloud and enable the necessary services:

1. Create a Google Cloud account and project if you don't have one
2. Enable the required Google Cloud APIs:
   ```bash
   gcloud services enable aiplatform.googleapis.com
   gcloud services enable compute.googleapis.com
   gcloud services enable container.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   gcloud services enable containerfilesystem.googleapis.com
   ```
3. Initialize the Google Cloud SDK with your project:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

### 2. Accessing Phi-4 on Hugging Face

Phi-4 is available on Hugging Face under Microsoft's organization. You'll need to:

1. Create a Hugging Face account if you don't have one
2. Request access to Microsoft Phi-4 model
3. Create a Hugging Face token with read access to the model
4. Install the Hugging Face SDK:
   ```bash
   pip install huggingface_hub
   ```

### 3. Deploying on Vertex AI

There are two main approaches for deploying Phi-4 on Vertex AI:

#### Option 1: Using Hugging Face Deep Learning Containers (DLCs)

This is the simpler approach:

1. Install the Google Cloud AI Platform SDK:

   ```bash
   pip install google-cloud-aiplatform
   ```

2. Initialize the AI Platform client:

   ```python
   import os
   from google.cloud import aiplatform

   aiplatform.init(
       project=os.getenv("PROJECT_ID"),
       location=os.getenv("LOCATION"), # e.g., "us-central1"
   )
   ```

3. Deploy Phi-4 using a Hugging Face DLC:

   ```python
   from google.cloud import aiplatform

   endpoint = aiplatform.Endpoint.create(display_name="phi4-endpoint")

   model = aiplatform.Model.upload(
       display_name="phi4-diarization",
       artifact_uri="gs://your-bucket/phi4-model",  # Storage for the model
       serving_container_image_uri="gcr.io/vertex-ai/huggingface-pytorch-inference:latest",
       serving_container_environment_variables={
           "HF_MODEL_ID": "microsoft/phi-4",
           "HF_TOKEN": "YOUR_HUGGINGFACE_TOKEN",
       },
   )

   model.deploy(
       endpoint=endpoint,
       machine_type="n1-standard-8",  # Adjust based on model size
       accelerator_type="NVIDIA_TESLA_T4",  # Optional GPU
       accelerator_count=1,           # Number of GPUs
       min_replica_count=1,
       max_replica_count=1,
   )
   ```

#### Option 2: Custom Handler with Phi-4 and Diarization Logic

For more control over the diarization process:

1. Create a custom handler Python script (e.g., `phi4_handler.py`) that:

   - Uses Phi-4 for diarization
   - Implements the same interface as your current `Phi4Client`
   - Processes audio and transcript data for speaker diarization

2. Package the handler and dependencies in a Docker container:

   ```dockerfile
   FROM python:3.10

   WORKDIR /app

   COPY requirements.txt .
   RUN pip install -r requirements.txt

   COPY phi4_handler.py .
   COPY startup.sh .

   ENTRYPOINT ["./startup.sh"]
   ```

3. Deploy the custom container to Vertex AI:

   ```python
   model = aiplatform.Model.upload(
       display_name="phi4-diarization-custom",
       artifact_uri="gs://your-bucket/phi4-custom-model",
       serving_container_image_uri="gcr.io/your-project/phi4-diarization:latest",
   )

   endpoint = aiplatform.Endpoint.create(display_name="phi4-custom-endpoint")
   model.deploy(endpoint=endpoint)
   ```

### 4. Updating Your Phi4Client Implementation

Now, update your existing phi4Client.ts to work with your custom Vertex AI endpoint:

```typescript
// In Phi4Client.ts
async #processDiarizationWithPhi4(prompt: string): Promise<string> {
  try {
    // Use Vertex AI endpoint instead of Microsoft API
    const vertexEndpoint = "https://YOUR_REGION-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT/locations/YOUR_REGION/endpoints/YOUR_ENDPOINT_ID:predict";

    const requestBody = {
      instances: [
        {
          prompt: prompt,
          model: "phi-4",
          messages: [
            {
              role: "system",
              content: "You are a speaker diarization assistant that only responds with valid JSON."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }
      ]
    };

    // Use Google Cloud authentication instead of API key
    const response = await fetch(vertexEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${await this.#getGoogleToken()}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Vertex AI request failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    return responseData.predictions[0].content;
  } catch (error) {
    logger.error("Error calling Phi-4 API via Vertex AI", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Helper method to get Google authentication token
async #getGoogleToken(): Promise<string> {
  // Use Google Auth library or service account credentials
  // This would typically use the Google Cloud client libraries
  // For local development you may need to use gcloud auth print-access-token
  // For production, use service account authentication

  // Example implementation depends on your deployment environment
  // This is a simplified placeholder
  const { auth } = require('google-auth-library');
  const client = await auth.getClient();
  return client.getAccessToken();
}
```

### 5. Environment Configuration

Update your env.ts file to include Vertex AI configuration:

```typescript
// Add to the existing Env object in env.ts
VERTEX_AI_ENDPOINT: v.optional(v.string()),
VERTEX_AI_PROJECT_ID: v.optional(v.string()),
VERTEX_AI_LOCATION: v.optional(v.string(), "us-central1"),
```

### 6. Cost Considerations

Hosting your own Phi-4 endpoint on Vertex AI can be more cost-effective than paying for Microsoft's API if:

1. You have consistent, high-volume usage
2. You need customizations to the diarization pipeline
3. You want more control over the model's deployment

However, it requires managing the infrastructure and keeping the model updated.

Would you like me to provide more specific details on any aspect of this implementation, such as the custom handler code or deployment scripts?
