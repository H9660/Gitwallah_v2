1. One worker for the REPO
2. orchestrator: Either create embeddings of the codebase and search by workers. Or use github api to read code.
3. APM approach or full code search(context heavy). I leave out the agent ability to perform dangerous operaitns on the repo like delteting repo, changing ownership, etc
4.Store the data in JSON files on disk. Keep a state.json to keep track of the last running stage and its output.
5. Agent accesses gh cli, gemini via sdk.
6. Using LLM for now. Can be extended to SLMs as well based on need with a change in .env variable. Agent can be limited by making sure that I dont give it access to any extra services via api keys. Even in gh cli the access that is given to agent is controlled by me.

7. As of now the LLM
8. Guardrails at the prompt level. Also the reviewer will not have permission to merge to delete the pull request.
9. See the APM architecture
10. Issue creation. Adding a PR on the comment itself.



-> Hindsight (half a page). If you started again tomorrow, which decision would you change first, and why?
Will focus more on brain selection. As where we can rely on SLMs and still get reasonably good results.


-> F2 used a lot of tokens just for file reads. around (78k) but the actual changes are in 4 files only