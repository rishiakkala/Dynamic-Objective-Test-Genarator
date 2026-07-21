# Architecture Overview

## Project Structure

```
Dynamic-Objective-Test-Genarator/
│
├── __pycache__/
│   ├── userProfile.cpython-313.pyc
│   └── utils.cpython-313.pyc
│
├── data/
│   └── samples/
│       ├── knowledge_base.txt
│       └── sample_questions.txt
│
├── docs/
│   ├── CONTRIBUTING.md
│   └── MultiAgent_MCQs_Project_final.docx
│
├── frontend/
│   ├── .gitignore
│   ├── README.md
│   ├── eslint.config.mjs
│   ├── next.config.ts
│   ├── package-lock.json
│   ├── public/
│   │   ├── file.svg
│   │   ├── globe.svg
│   │   ├── next.svg
│   │   ├── vercel.svg
│   │   └── window.svg
│   └── src/
│       ├── app/
│       │   ├── favicon.ico
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── dashboard/
│       │   │   └── page.tsx
│       │   ├── profile/
│       │   │   └── page.tsx
│       │   └── session/
│       │       └── page.tsx
│       ├── components/
│       │   └── Navbar.tsx
│       └── lib/
│           └── api.ts
```

## Architecture Pattern

The project follows a **Microservices Architecture** pattern with a clear separation between the frontend and backend components. The frontend is built using TypeScript with Next.js, while the backend is implemented in Python, leveraging the crewai framework for AI-driven functionalities. The database used is chromadb, which is likely used for storing and retrieving question data.

## Data Flow Diagram (Text)

1. **Frontend Interaction**: 
   - User interacts with the web application through the UI components (`Navbar.tsx`, `page.tsx` files).
   - User actions trigger API calls defined in `api.ts`.

2. **API Communication**:
   - The frontend communicates with the backend services via RESTful APIs.
   - API endpoints handle requests related to user profiles, test generation, and session management.

3. **Backend Processing**:
   - The backend processes incoming requests using Python scripts.
   - Utilizes the crewai framework for generating dynamic test questions based on the knowledge base.

4. **Database Interaction**:
   - The backend interacts with chromadb to store and retrieve data related to questions and user profiles.
   - Data from `knowledge_base.txt` and `sample_questions.txt` is utilized for generating test content.

5. **Response**:
   - Processed data is sent back to the frontend for rendering and user interaction.

## Key Components

- **Frontend**:
  - Built with Next.js, utilizing TypeScript for type safety.
  - Contains components for user interaction (`Navbar.tsx`) and pages for different application sections (dashboard, profile, session).

- **Backend**:
  - Implemented in Python, leveraging the crewai framework for AI functionalities.
  - Handles business logic for dynamic test generation and user session management.

- **Database**:
  - chromadb is used for efficient data storage and retrieval, particularly for question data and user profiles.

- **Data Samples**:
  - `knowledge_base.txt` and `sample_questions.txt` provide the foundational data for generating test questions.

This architecture allows for scalable and efficient generation of dynamic objective tests, leveraging AI capabilities and a modern web framework.