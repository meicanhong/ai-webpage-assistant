document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 加载保存的设置
    const data = await chrome.storage.sync.get(["apiKey", "model", "prompts"]);

    const apiKeyInput = document.getElementById("apiKey");
    const modelSelect = document.getElementById("model");

    if (apiKeyInput && data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }

    if (modelSelect) {
      modelSelect.value = data.model || "gpt-4o-mini";
    }

    // 加载保存的 prompts
    if (data.prompts) {
      renderPrompts(data.prompts);
    }

    // 添加 Prompt 按钮事件
    document
      .getElementById("addPromptBtn")
      .addEventListener("click", async () => {
        const newPrompt = document.getElementById("newPrompt").value.trim();
        if (!newPrompt) return;

        const data = await chrome.storage.sync.get(["prompts"]);
        const prompts = data.prompts || [];
        prompts.push(newPrompt);

        await chrome.storage.sync.set({ prompts });
        document.getElementById("newPrompt").value = "";
        renderPrompts(prompts);
        showStatus("Prompt 已添加", "success");
      });

    // 保存设置
    document
      .getElementById("saveButton")
      .addEventListener("click", async () => {
        const apiKey = document.getElementById("apiKey").value.trim();
        const model = document.getElementById("model").value;

        if (!apiKey) {
          showStatus("请输入 API Key", "error");
          return;
        }

        try {
          // 验证 API Key
          const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "Hello" }],
                max_tokens: 5,
              }),
            }
          );

          if (!response.ok) {
            throw new Error("API Key 无效");
          }

          // 保存设置
          await chrome.storage.sync.set({ apiKey, model });
          showStatus("设置已保存", "success");
        } catch (error) {
          showStatus(error.message, "error");
        }
      });
  } catch (error) {
    console.error("Error initializing options:", error);
    showStatus("加载设置时出错", "error");
  }
});

function renderPrompts(prompts) {
  const promptList = document.getElementById("promptList");
  promptList.innerHTML = "";

  prompts.forEach((prompt, index) => {
    const promptItem = document.createElement("div");
    promptItem.className = "prompt-item";

    const promptText = document.createElement("div");
    promptText.className = "prompt-text";
    promptText.textContent = prompt;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "删除";
    deleteBtn.onclick = async () => {
      const data = await chrome.storage.sync.get(["prompts"]);
      const updatedPrompts = data.prompts.filter((_, i) => i !== index);
      await chrome.storage.sync.set({ prompts: updatedPrompts });
      renderPrompts(updatedPrompts);
      showStatus("Prompt 已删除", "success");
    };

    promptItem.appendChild(promptText);
    promptItem.appendChild(deleteBtn);
    promptList.appendChild(promptItem);
  });
}

function showStatus(message, type) {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message;
    status.className = `message ${type}`;
    status.style.display = "block";
    setTimeout(() => {
      status.style.display = "none";
    }, 3000);
  }
}
