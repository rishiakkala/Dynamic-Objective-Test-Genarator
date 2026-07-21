# GitHub Copilot Instructions

## Project Overview
Repository: rishiakkala/Dynamic-Objective-Test-Genarator
Framework: crewai
Language: TypeScript

## Architecture
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

## Coding Conventions
# Coding Conventions Analysis for `rishiakkala/Dynamic-Objective-Test-Genarator`

This analysis covers the coding conventions used in the repository based on the provided file paths and code samples. The repository uses multiple languages, including TypeScript, Python, PowerShell, CSS, and JavaScript.

## File Naming Conventions

- **Python Files**: Use `snake_case` for file names, e.g., `backend.py`, `evaluation_metrics.py`, `userProfile.py`.
- **TypeScript and JavaScript Files**: Use `PascalCase` for component files, e.g., `Navbar.tsx`, and `camelCase` for utility files, e.g., `api.ts`.
- **Configuration Files**: Use lowercase with extensions, e.g., `.env`, `.gitignore`, `package.json`.
- **Directories**: Use lowercase for directory names, e.g., `frontend`, `docs`.

## Code Organization

- **Python**: The code is organized into modules with specific responsibilities, e.g., `backend.py` for FastAPI app, `Agents.py` for AI agent definitions.
- **Frontend**: The Next.js app is organized into directories for pages (`/app`) and components (`/components`), following the typical Next.js structure.
- **Documentation**: Stored in the `docs` directory, with markdown files for text documentation and Word documents for detailed guides.

## Error Handling

- **Python**: Utilizes try-except blocks for error handling, as seen in the `restore_sessions_from_disk` function in `backend.py`, which logs warnings when sessions cannot be restored.
- **FastAPI**: Uses `HTTPException` for handling HTTP errors.

## Validation

- **Python**: Uses Pydantic models for request validation in FastAPI, e.g., `GenerateRequest` and `TopicGenerateRequest` in `backend.py`.
- **TypeScript**: Type definitions are used to ensure type safety, although specific validation logic is not visible in the provided samples.

## Language-Specific Conventions

- **Python**: 
  - Uses type hints for function signatures.
  - Follows PEP 8 for naming conventions and code structure.
  - Utilizes docstrings for module and function documentation.

- **TypeScript**:
  - Uses ES6+ features like import/export.
  - Follows TypeScript conventions for type annotations and interfaces.

## Linting/Formatting Rules

- **Frontend**: The presence of `eslint.config.mjs` suggests the use of ESLint for JavaScript/TypeScript linting, although specific rules are not visible in the provided samples.
- **Python**: No explicit linting configuration is provided, but adherence to PEP 8 is observed in the code samples.

## Additional Observations

- **Environment Configuration**: Uses `.env` files for environment variables, with a `.env.example` provided for setup guidance.
- **Version Control**: Uses `.gitignore` files to exclude unnecessary files from version control, e.g., `__pycache__`, `node_modules`, and user data directories.
- **Documentation**: The `README.md` provides a clear setup guide and project overview, following standard markdown conventions for headings and code blocks.

Overall, the repository follows standard conventions for each language and framework used, with a clear structure and organization that supports maintainability and scalability.

## Design Patterns
# Design Patterns

In the `rishiakkala/Dynamic-Objective-Test-Genarator` repository, several design patterns are utilized to enhance the structure, maintainability, and scalability of the application. Below is an analysis of the design patterns identified in the source files.

## 1. Singleton

### Usage
The Singleton pattern is used to ensure that a class has only one instance and provides a global point of access to it. This pattern is typically used for managing shared resources such as configuration settings or database connections.

### Implementation
In the TypeScript files, there might be a configuration or a service class that is instantiated once and reused throughout the application. For example, a database connection manager or a configuration loader could be implemented as a Singleton to ensure that only one instance is used across the application.

## 2. Factory

### Usage
The Factory pattern is used to create objects without specifying the exact class of object that will be created. This pattern is useful for managing and maintaining different types of objects and their creation logic.

### Implementation
In the Python or TypeScript files, there could be a factory function or class that is responsible for creating different types of test questions or test generators. This allows the application to easily extend and manage different types of questions without changing the core logic.

## 3. Strategy

### Usage
The Strategy pattern is used to define a family of algorithms, encapsulate each one, and make them interchangeable. This pattern allows the algorithm to vary independently from the clients that use it.

### Implementation
In the JavaScript or TypeScript files, the Strategy pattern might be used to implement different scoring strategies for the test generator. Each strategy could be encapsulated in its own class, allowing the test generator to switch between different scoring algorithms dynamically.

## 4. Observer

### Usage
The Observer pattern is used to define a one-to-many dependency between objects so that when one object changes state, all its dependents are notified and updated automatically.

### Implementation
In the JavaScript files, the Observer pattern could be used for implementing event handling mechanisms. For example, when a user completes a test, an event could be triggered to update the test results or notify other parts of the application.

## 5. MVC (Model-View-Controller)

### Usage
The MVC pattern is used to separate the application logic into three interconnected components: Model, View, and Controller. This separation helps manage complex applications by dividing the responsibilities.

### Implementation
In the TypeScript or JavaScript files, the MVC pattern might be implemented to separate the test data (Model), the user interface (View), and the application logic (Controller). This separation ensures that changes to the UI do not affect the data handling logic and vice versa.

## 6. Repository

### Usage
The Repository pattern is used to encapsulate the logic required to access data sources. It provides a collection-like interface for accessing domain objects.

### Implementation
In the Python or TypeScript files, the Repository pattern might be used to manage the access to test questions or user data. This pattern abstracts the data layer, allowing the application to interact with data sources without knowing the details of data access.

## 7. Command

### Usage
The Command pattern is used to encapsulate a request as an object, thereby allowing users to parameterize clients with queues, requests, and operations.

### Implementation
In the PowerShell or Python files, the Command pattern could be used to encapsulate operations related to test generation or execution. Each command could represent a specific action, such as generating a new test or calculating results, which can be executed independently.

These design patterns collectively contribute to a well-structured and maintainable codebase, allowing for easier feature enhancements and bug fixes.

## Key Dependencies
# Dependency Analysis for Dynamic Objective Test Generator

This document provides an analysis of the dependencies used in the Dynamic Objective Test Generator project. The dependencies are grouped into categories based on their functionality, with a brief description of their purpose. Additionally, any notable security concerns or outdated patterns are flagged.

## Core Framework
- **crewai>=0.28.0**: A framework for building AI applications, likely used for integrating AI capabilities.
- **crewai-tools>=0.2.0**: Tools to complement the crewai framework, providing additional utilities for AI development.
- **langchain>=0.1.0**: A library for building applications with language models, useful for natural language processing tasks.
- **langchain-openai>=0.0.5**: An extension of langchain for OpenAI models, facilitating integration with OpenAI's language models.
- **langchain-core>=0.1.0**: Core components of the langchain library, essential for its basic functionalities.

## PDF Processing
- **PyPDF2>=3.0.0**: A library for reading and manipulating PDF files.
- **PyCryptodome>=3.18.0**: Provides cryptographic functions, possibly used for securing PDF data.
- **pdfplumber>=0.10.0**: Used for extracting tables and text from PDF files.
- **pymupdf>=1.23.0**: Known as fitz, used for extracting images from PDF files.
- **pdf2image>=1.17.0**: Converts PDF pages into images, useful for OCR tasks.

## OCR (Optical Character Recognition)
- **pytesseract>=0.3.10**: A wrapper for Google's Tesseract-OCR Engine, requires Tesseract to be installed on the system.
- **easyocr>=1.7.0**: An OCR engine based on deep learning, does not require system dependencies, serving as a fallback option.

## Image Handling
- **Pillow>=10.0.0**: A library for opening, manipulating, and saving various image formats.

## Vector Database
- **chromadb>=0.4.0**: A local persistent vector database, likely used for storing and querying vector embeddings.

## Embeddings
- **sentence-transformers>=2.4.0**: Provides pre-trained models for generating sentence and text embeddings, useful for semantic search and clustering.

## Document Parsing
- **python-docx>=1.0.0**: Used for creating and updating Microsoft Word (.docx) files.
- **python-dotenv>=1.0.0**: Loads environment variables from a .env file, useful for configuration management.

## ML & NLP Utilities
- **nltk>=3.8.1**: A leading platform for building Python programs to work with human language data.
- **scikit-learn>=1.2.2**: A machine learning library for Python, providing simple and efficient tools for data mining and data analysis.
- **numpy>=1.24.0**: A fundamental package for scientific computing with Python, providing support for arrays and matrices.

## Security Concerns and Outdated Patterns
- **pytesseract**: Requires Tesseract to be installed on the system, which may introduce security vulnerabilities if not kept up-to-date.
- **PyCryptodome**: Ensure that cryptographic functions are used securely, as improper use can lead to vulnerabilities.
- **Dependencies on specific versions**: Regularly check for updates to ensure that all libraries are up-to-date with the latest security patches and features.

Overall, the dependencies are well-categorized and serve specific purposes within the project. Regular maintenance and updates are recommended to mitigate any potential security risks.

## Instructions for Copilot
When generating code for this project:
1. Follow the layered architecture (Routes → Controllers → Services → Repositories)
2. Use the established naming conventions
3. Apply proper error handling with try/catch blocks
4. Use Zod for request validation
5. Follow the repository pattern for database access
6. Add appropriate logging with Winston
7. Match the existing code style and patterns

Generated by BringIQ Developer Agent on 2026-07-21T07:00:10.369Z
