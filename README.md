M-b AI Film Studio

An independent AI-powered filmmaking platform

M-b AI Film Studio is an AI-assisted filmmaking environment designed to bring screenplay development, scene planning, visual production, continuity management, timeline editing, and film export into one integrated workspace.

The platform aims to make filmmaking more accessible to creators worldwide through an extensible architecture that can connect to multiple AI providers.

---

Table of Contents

- "Project Overview" (#project-overview)
- "Core Capabilities" (#core-capabilities)
- "Technology and Architecture" (#technology-and-architecture)
- "Getting Started" (#getting-started)
- "Environment Configuration" (#environment-configuration)
- "Running the Application" (#running-the-application)
- "Production Workflow" (#production-workflow)
- "Video Generation and Provider Integration" (#video-generation-and-provider-integration)
- "Timeline and Export" (#timeline-and-export)
- "Security Considerations" (#security-considerations)
- "Development Roadmap" (#development-roadmap)

---

Project Overview

M-b AI Film Studio is being developed as an independent, end-to-end filmmaking platform.

Its goal is to provide creators with a structured production workflow:

1. Create a film project.
2. Upload an existing screenplay or generate one with AI.
3. Break the screenplay into acts, scenes, and shots.
4. Build scenes and define their visual requirements.
5. Develop characters, casting, locations, and visual styles.
6. Generate or import production footage.
7. Arrange and edit clips on a multi-track timeline.
8. Review continuity and production consistency.
9. Export the completed production.

The platform is designed with extensibility, multilingual support, and integration with different AI services in mind.

Project identity: M-b AI Film Studio is an independent project. Integrations with third-party AI providers do not imply ownership, sponsorship, or affiliation with those providers.

---

Core Capabilities

1. Screenplay Development and Breakdown

The Screenplay Studio is designed to accept screenplay text and organize it into a structured production plan.

Planned and supported workflow elements include:

- Screenplay input and editing.
- Automatic act identification.
- Scene extraction and organization.
- Shot breakdown and descriptions.
- Character identification.
- Scene-level duration planning.
- Target film-duration management.

The intended project-duration range is configurable from 4 seconds to 120 minutes. Actual production duration depends on the footage available and the timeline assembly process.

2. Scene Construction

The Scene Builder organizes the creative and technical requirements of individual scenes.

Scene information can include:

- Scene descriptions and objectives.
- Characters and casting requirements.
- Locations and environments.
- Visual style and atmosphere.
- Camera direction and shot composition.
- Lighting and time-of-day requirements.
- Dialogue and sound requirements.
- Individual shot durations.

3. AI Provider Integration

M-b AI Film Studio is designed around an extensible provider-integration architecture.

The objective is to support different AI services for tasks such as:

- Screenplay generation and refinement.
- Scene and shot analysis.
- Cinematic prompt generation.
- Character and environment development.
- AI-generated video production.
- Continuity analysis and director assistance.

Provider-specific limitations, model availability, pricing, and maximum generation durations must be verified against each provider's current API documentation.

Longer production sequences should be divided into manageable clips and assembled through the timeline.

4. Multi-Track Timeline Editor

The Timeline Editor provides a structured workspace for arranging production assets.

Intended editing capabilities include:

- Multi-track clip organization.
- Clip reordering.
- Duration adjustment and trimming.
- Timeline navigation and zoom.
- Frame-based positioning.
- Timecode display using "HH:MM:SS:FF".
- Alignment with the target production duration.
- Sequential assembly of generated and imported footage.

5. Cinema Preview

The Cinema Preview provides a visual workspace for reviewing the production timeline.

Preview features may include:

- 16:9, 9:16, and 2.39:1 aspect-ratio layouts.
- Rule-of-thirds composition guides.
- Dialogue and subtitle display.
- Camera-movement previews.
- Playback at a target frame rate.

Important: Procedural camera movement and preview animations are not equivalent to AI-generated video footage. Real video playback requires actual video assets.

6. AI Continuity Assistant

The Continuity Assistant is designed to help identify inconsistencies between scenes and shots.

Potential checks include:

- 180-degree rule and screen-direction consistency.
- Lighting continuity.
- Time-of-day consistency.
- Character and costume continuity.
- Location and environment consistency.
- Camera-angle and shot-transition consistency.
- Visual-prompt consistency.

AI-generated recommendations should be reviewed by the creator before being applied.

7. Export and Editing Interoperability

The export system is designed to support production handoff and compatibility with external editing software.

Supported or planned export formats include:

Format| Purpose
CMX 3600 EDL| Edit Decision List
FCPXML 1.9| Editing interchange for compatible applications
SRT| Subtitle files
JSON| Production metadata and project manifests

These formats represent editing instructions, subtitles, or project data. They do not, by themselves, render a finished MP4 film.

A completed MP4 export requires a working video-rendering pipeline that processes the actual video and audio assets, for example through FFmpeg or an equivalent rendering engine.

---

Technology and Architecture

M-b AI Film Studio uses a web application architecture with a frontend, backend services, and external AI integrations.

The architecture should keep the following responsibilities separate:

Component| Responsibility
Frontend| User interface, project workspace, scene builder, timeline, and preview
Backend| API endpoints, validation, project operations, and production orchestration
AI integration layer| Communication with supported AI providers
Media processing layer| Video and audio processing, clip assembly, and rendering
Storage layer| Project data, scripts, generated assets, and exported files

The application should use provider adapters so that one AI service can be replaced or supplemented without redesigning the entire platform.

---

Getting Started

Prerequisites

- Node.js 18 or later.
- npm.
- Git (recommended).
- API credentials for any external AI services you choose to enable.

1. Clone the Repository

git clone https://github.com/Markbruise/M-b-ai-film-stud8.git
cd M-b-ai-film-stud8

2. Install Dependencies

npm install

3. Configure Environment Variables

Create a local environment file:

cp .env.example .env

Add the required configuration values to ".env".

See "Environment Configuration" (#environment-configuration).

4. Start the Development Server

npm run dev

Open the local URL displayed in your terminal.

5. Create a Production Build

npm run build

6. Start the Production Server

npm start

The production start command and deployment configuration should match the scripts defined in "package.json".

---

Environment Configuration

Example configuration:

GEMINI_API_KEY=your_gemini_api_key
PORT=3000
NODE_ENV=development

Additional provider credentials should only be added when their integrations are implemented and enabled.

Security requirements:

- Never commit ".env" files or API keys to GitHub.
- Store production credentials in the deployment platform's secret manager.
- Keep private API calls on the backend.
- Validate requests before forwarding them to AI providers.
- Avoid exposing provider credentials in frontend code or browser responses.

---

Running in Google AI Studio

Google AI Studio may be used as a development environment when the project configuration is compatible with it.

For an AI Studio-based workflow:

1. Import the project files or upload the project ZIP.
2. Review the project configuration and dependencies.
3. Configure the required API credentials using the environment's supported Secrets feature.
4. Start the application using the configured development command.
5. Verify backend connectivity and application functionality.

The application should not depend exclusively on Google AI Studio. Its architecture should remain portable to other compatible development and hosting environments.

---

Production Workflow

The intended filmmaking workflow is:

Screenplay → Scene Builder → Visual Development → Production → Timeline → Review → Export

Each stage should preserve the project data and production decisions made in the previous stage.

The timeline should assemble individual clips into a complete production while respecting the creator's selected target duration.

---

Video Generation and Provider Integration

Real AI video generation requires a functioning connection to a supported provider.

A complete integration should implement:

1. Provider authentication.
2. Request validation.
3. Prompt and generation-parameter submission.
4. Job-status tracking.
5. Error handling and retry logic.
6. Generated-video retrieval.
7. Asset validation and storage.
8. Timeline integration.

The application must distinguish between:

- AI-generated video.
- Imported video footage.
- Procedural previews.
- Placeholder media.
- Editing metadata.

A successful API response should not be treated as proof that a usable video file has been generated. The returned media must be retrieved, validated, and made available to the timeline.

---

Timeline and MP4 Rendering

The timeline and rendering systems have separate responsibilities.

The timeline manages clip placement, timing, tracks, and editing instructions.

The rendering pipeline must process the actual media assets to produce a final video.

A production-ready rendering implementation should support:

- Video clip concatenation and sequencing.
- Audio mixing.
- Frame-rate normalization.
- Resolution and aspect-ratio handling.
- Transition processing.
- Subtitle integration.
- Final MP4 encoding.
- Export validation and error reporting.

The final output should be a playable video file, not an HTML page or a metadata-only download.

---

Security Considerations

Security is a core requirement for the platform.

Development and deployment should follow these practices:

- Keep API credentials server-side.
- Validate and sanitize user input.
- Apply authentication and authorization where required.
- Protect user projects and uploaded assets.
- Restrict file-upload types and sizes.
- Validate generated media before processing.
- Apply appropriate rate limits to expensive AI operations.
- Keep dependencies updated.
- Avoid logging private credentials or sensitive user content.

---

Development Roadmap

The long-term development direction includes:

- Complete screenplay-to-production workflow.
- Reliable multi-provider AI integration.
- Real AI-generated video retrieval and playback.
- Persistent project and media storage.
- Advanced multi-track timeline editing.
- Actual MP4 rendering and export.
- Audio, dialogue, and subtitle production.
- Character and scene continuity management.
- Worldwide language support.
- Portable deployment beyond a single development platform.

---

Project Status

M-b AI Film Studio is an actively developing project. Individual features may have different implementation and verification states.

The presence of a feature in this README describes the intended architecture or workflow; it should not be interpreted as proof that every integration is fully operational.

Implementation status should be verified through automated tests, API integration tests, and end-to-end production tests.

---

License

The project license will be specified in the repository's "LICENSE" file.

Until a license is added and published, users should not assume that the source code is available under an open-source license.

---

Project Repository

M-b AI Film Studio

GitHub: https://github.com/Markbruise/M-b-ai-film-stud8

Built with the vision of making filmmaking more accessible through intelligent, extensible, and creator-focused technology.