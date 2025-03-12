{
	"id":   "tulsa-transcribe-sdni",
	"lang": "typescript",
	"build": {
		"docker": {
			"bundle_source": true
		}
	},
	"name": "tulsa-transcribe",
	"baseurl": "tulsa-transcribe.app.encore.dev",
	"global_cors": {
		"allow_headers": ["*"],
		"allow_origins_without_credentials": ["*"],
		"allow_origins_with_credentials": ["https://*.tulsa-transcribe.app.encore.dev"]
	}
}
