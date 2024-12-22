# Vision Agent

### Introduction

An overview of all the agents, how they communicate, and how human-in-the-loop works.

`vision_agent_v2:` A conversational agent that performs a single action per response. Actions are predefined JSON commands, executed externally to maintain control over inputs and code execution.

`vision_agent_planner_v2:` A planning agent capable of executing Python code over multiple turns using available tools. It explores and tests steps to develop a plan.

`vision_agent_coder_v2:` A coding agent that generates and tests the final code. It can use the planner autonomously or rely on the finalized plan context provided by the planner.

---

### Communication

The agents communicate through AgentMessage's and return PlanContext's and CodeContext's for the planner and coder agent respectively.
```
_______________
|VisionAgentV2|
---------------
       |                       ____________________
       -----(AgentMessage)---> |VisionAgentCoderV2|
                               --------------------
                                         |                        ______________________
                                         -----(AgentMessage)----> |VisionAgentPlannerV2|
                                                                  ----------------------
                               ____________________                         |
                               |VisionAgentCoderV2| <----(PlanContext)-------
                               --------------------
_______________                          |
|VisionAgentV2|<-----(CodeContext)--------
---------------
```

---

### AgentMessage and Contexts

The `AgentMessage` extends basic chat functionality with additional roles such as `conversation`, `planner`, and `coder`, which are subtypes of the assistant role. These roles correspond to `VisionAgentV2`, `VisionAgentPlannerV2`, and `VisionAgentCoderV2`. Observations result from executing Python code internally by the planner. The `VisionAgentPlannerV2` produces a `PlanContext` containing finalized plans, including instructions and code snippets, which the `VisionAgentCoderV2` uses to generate a `CodeContext` with the final code and supplementary details.

---

### Callbacks

If you want to recieve intermediate messages you can use the `update_callback` argument in all the `V2` constructors. This will asynchronously send `AgentMessage`'s to the callback function you provide. You can see an example of how to run this in `app.py`

---

### Human-in-the-loop

The Human-in-the-Loop (HITL) feature allows users to interact with agents during a conversation using `interaction` and `interaction_response` roles in `AgentMessage`. It can be enabled by setting `hil=True` in `VisionAgentV2`, but it requires using the `update_callback` to collect and pass messages back to `VisionAgentV2`. When the `planner` agent needs human input, it generates an `InteractionContext` that propagates to the user via `VisionAgentV2`, exiting the `planner`. The last `AgentMessage` collected via `update_callback` will have a role of `interaction` and contain a JSON string enclosed in `<interaction>` tags -

```
AgentMessage(
    role="interaction",
    content="<interaction>{\"prompt\": \"Should I use owl_v2_image or countgd_counting?\"}</interaction>",
    media=None,
)
```

The user can then add an additional `AgentMessage` with the role `interaction_response` and the response they want to give:

```
AgentMessage(
    role="interaction_response",
    content="{\"function_name\": \"owl_v2_image\"}",
    media=None,
)
```

You can see an example of how this works in `chat-app/src/components/ChatSection.tsx` under the `handleSubmit` function.

---

### Chatbot and Video Streaming

<img width="1800" alt="Screenshot 2024-12-22 at 17 54 39" src="https://github.com/user-attachments/assets/415b6fb8-d54f-4d14-8407-475c8c271ba0" />

---



