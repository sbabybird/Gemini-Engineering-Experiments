# Gemini Development Guidelines

## Core Mandates

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project (check imports, configuration files like 'package.json', 'Cargo.toml', 'requirements.txt', 'build.gradle', etc., or observe neighboring files) before employing it.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.
- **Idiomatic Changes:** When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
- **Comments:** Add code comments sparingly. Focus on *why* something is done, especially for complex logic, rather than *what* is done. Only add high-value comments if necessary for clarity.
- **Proactiveness:** Fulfill the user's request thoroughly, including reasonable, directly implied follow-up actions.
- **Confirm Ambiguity/Expansion:** Do not take significant actions beyond the clear scope of the request without confirming with the user. If asked *how* to do something, explain first, don't just do it.

## Primary Workflow

### 1. Understand & Plan
- **Goal:** Before writing any code, develop a clear plan.
- **Actions:**
    - Use `glob`, `read_file`, and `search_file_content` extensively to understand the codebase, identify relevant files, and locate existing patterns.
    - Analyze test files (`*_test.py`, `*.spec.ts`, etc.) to understand how the project tests its code.
    - Formulate a concise, step-by-step plan.
    - If the task is complex, present the plan to the user before proceeding.

### 2. Implement
- **Goal:** Make small, incremental, and verifiable changes.
- **Actions:**
    - **Test-Driven:** When feasible, write a failing test that captures the requirement before writing the implementation.
    - **Minimal Code:** Write only the code necessary to fulfill the immediate step of the plan and make the test pass.
    - **Tool-Based Changes:** Use tools like `replace` or `write_file` to apply changes. Ensure `old_string` in `replace` calls has sufficient context to be unique.

### 3. Verify
- **Goal:** Ensure the change is correct, complete, and adheres to project standards.
- **Actions:**
    - **Run Tests:** Execute the project's test suite to confirm your changes haven't introduced regressions.
    - **Run Linters/Formatters:** Run tools like `ruff`, `prettier`, `eslint`, etc., as defined by the project, to ensure code quality and style consistency.
    - **Commit-Ready State:** Leave the code in a state that is ready to be committed. Every change should result in a compilable and test-passing state.

## When Blocked or Uncertain

If an approach is not working or you are unsure how to proceed, do not guess. Instead:
1.  **Stop & Document:** Pause and clearly articulate the problem, the attempted solutions, and the specific errors encountered.
2.  **Re-evaluate:** Question the current approach. Is there a simpler way? Am I making an incorrect assumption?
3.  **Broaden Context:** Use tools to look for alternative implementations or patterns within the project that might offer a better path.
4.  **Consult:** Present the problem, your findings, and potential alternative approaches to the user for guidance.

## Technical Principles

- **Simplicity:** Prefer clear, straightforward code over clever or complex solutions.
- **Composition over Inheritance:** Use dependency injection and interfaces for flexibility and testability.
- **Explicit is Better than Implicit:** Ensure data flow and dependencies are clear.
- **Error Handling:** Fail fast with descriptive messages. Never swallow exceptions silently.
- **Tooling:** Use the project's existing build systems, test frameworks, and linters. Do not introduce new tools without a strong justification and user confirmation.
