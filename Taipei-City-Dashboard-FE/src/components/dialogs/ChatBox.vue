<script setup>
import { ref, watch, nextTick } from "vue";
import { storeToRefs } from "pinia";
import SendIcon from "../icons/SendIcon.vue";
import BotLogo from "../icons/BotLogo.vue";
import UserLogo from "../icons/UserLogo.vue";

import { useChatStore } from "../../store/chatStore";
import { useContentStore } from "../../store/contentStore";
import { useAuthStore } from "../../store/authStore";
import http from "../../router/axios";

const chatStore = useChatStore();
const contentStore = useContentStore();
const authStore = useAuthStore();
const { addChatData, addQueryData, saveChatLog } = chatStore;
const { createDashboard } = contentStore;
const { chatData, currentMode, isTyping } = storeToRefs(chatStore);
const { editDashboard } = storeToRefs(contentStore);
const { user } = storeToRefs(authStore);

const topics = [
  { id: 'disaster', name: '防災', icon: '🌊' },
  { id: 'food', name: '食安', icon: '🍱' },
  { id: 'culture', name: '文化', icon: '🏛️' },
  { id: 'health', name: '健康', icon: '🏥' }
];
const selectedTopic = ref(null);

const chatWithLLM = async (userMsg, topicId = null) => {
		currentMode.value = 'concierge'
		isTyping.value = true
		
		// 1. Add user message
		addChatData({ role: 'user', content: userMsg })

		// 如果有主題，模擬原型中的「探索流」
		if (topicId) {
			const botMsgId = chatData.value.length + 1;
			const steps = [
				{ label: '正在調用組件分析工具...', status: 'running' },
				{ label: '計算跨區資源覆蓋率...', status: 'running' },
				{ label: '對比雙城統計數據...', status: 'running' }
			];
			
			addChatData({ 
				role: 'bot', 
				content: "正在為您準備城市數據導覽...", 
				steps: steps 
			});

			// 模擬工具執行過程 (UX 用)
			for (let i = 0; i < steps.length; i++) {
				await new Promise(r => setTimeout(r, 600));
				steps[i].status = 'done';
			}
		}

		try {
			// 2. Call BE AI Chat API
			const response = await http.post("/ai/chat", {
				mode: "concierge",
				messages: chatData.value
					.filter(m => !m.isDefault)
					.map(m => ({
						role: m.role === 'bot' ? 'assistant' : m.role,
						content: m.content
					}))
			});

			if (response.data?.status === "success") {
				const answer = response.data.data.answer;
				
				// 取得最後一條機器人訊息並更新
				const lastBotMsg = chatData.value[chatData.value.length - 1];
				if (lastBotMsg.role === 'bot' && lastBotMsg.steps) {
					lastBotMsg.content = answer;
					// 這裡可以根據回傳內容決定是否展示卡片 (Mock 一些數據卡片展示成果)
					if (topicId === 'disaster') {
						lastBotMsg.dataCard = {
							label: '防災避難設施缺口分析',
							stats: [
								{ v: '63.5%', u: '', k: '全市覆蓋率' },
								{ v: '4,820', u: '人', k: '最大缺口(文山)' }
							],
							bars: [
								{ l: '文山', v: 82, c: '#FF4444' },
								{ l: '萬華', v: 67, c: '#FF4444' },
								{ l: '大同', v: 60, c: '#FF8800' }
							]
						};
					} else if (topicId === 'food') {
						lastBotMsg.pkData = [
							{ m: '稽查合格率', tp: '96.2%', nt: '94.9%', better: 'tp' },
							{ m: '平均稽查頻率', tp: '3.2次/年', nt: '2.8次/年', better: 'tp' },
							{ m: '不合格處置率', tp: '98%', nt: '92%', better: 'tp' }
						];
					}
				} else {
					addChatData({ role: 'bot', content: answer });
				}
			} else {
				addChatData({ role: 'bot', content: "抱歉，我現在無法回答這個問題。" });
			}
		} catch (error) {
			console.error("LLM Chat Error:", error);
			addChatData({ role: 'bot', content: "連線異常，請檢查後端服務。" });
		} finally {
			isTyping.value = false
		}
	};

const switchToConcierge = (topicId) => {
  currentMode.value = 'concierge';
  selectedTopic.value = topicId;
  if (topicId) {
    const topic = topics.find(t => t.id === topicId);
    chatWithLLM(`我想深入了解${topic.name}現況`, topicId);
  }
};

const userMessage = ref("");
const chatAreaRef = ref(null);
const isStickyOpen = ref(false);
const dashboardCreationLoading = ref(false);

const qaBtnHandler = async (text, relations) => {
	if (text === "建立儀表板") {
		if (dashboardCreationLoading.value === true) return;
		dashboardCreationLoading.value = true;
		// 確認個人儀表板是否超過20個
		const response = await http.get(`/dashboard/`);
		if (response.data?.data?.personal?.length > 20) {
			addChatData({
				role: "bot",
				content:
					"您的個人儀表板已超出限制 20 個，請先移除既有儀表板後，重新執行本功能！",
			});
			dashboardCreationLoading.value = false;
			return;
		}
		const components = Array.from(new Set(relations.map((r) => r.id))).map(
			(id) => ({ id }),
		);

		if (user.value.user_id) {
			editDashboard.value = {
				index: "",
				name: "推薦儀表板",
				icon: "star",
				components: components,
			};
			await createDashboard();
			saveChatLog("建立儀表板", "使用者成功建立儀表板!");
		} else {
			addChatData({
				role: "bot",
				content: "請先登入會員以使用此功能喔！",
			});
		}
		dashboardCreationLoading.value = false;
	} else if (text.startsWith("🔍 探索")) {
		userMessage.value = text.replace("🔍 探索", "幫我介紹 ");
		sendBtnHandler(userMessage.value);
	}
};

const sendBtnHandler = (text) => {
	if (!text.trim()) return;
	if (currentMode.value === 'concierge') {
		chatWithLLM(text);
	} else {
		addQueryData({
			role: "user",
			content: text,
		});
	}
	userMessage.value = "";
};

const toggleSticky = () => {
	isStickyOpen.value = !isStickyOpen.value;
};

watch(
	() => chatData.value.length,
	async () => {
		await nextTick();
		const chat = chatAreaRef.value;
		if (!chat) return;
		chat.scrollTop = chat.scrollHeight - chat.clientHeight;
	},
	{ deep: true },
);
</script>

<template>
  <div class="chat-widget">
    <!-- 標題 -->
    <div class="header">
      <div class="brand-info">
        <div class="brand-icon">✦</div>
        <div class="brand-text">
          <h3>臺北城市儀表板</h3>
          <span class="sub-text">AI 城市導覽員</span>
        </div>
      </div>
      <div class="nexus-badge">
        <div class="nexus-dot"></div>
        <span class="nexus-label">LIVE</span>
      </div>
    </div>

    <!-- 模式/主題切換 -->
    <div class="topic-tabs scrollbar-x-hide">
      <button :class="{ active: currentMode === 'recommend' }" @click="currentMode = 'recommend'">🔍 組件推薦</button>
      <button :class="{ active: currentMode === 'concierge' && !selectedTopic }" @click="switchToConcierge(null)">🤖 AI 導覽</button>
      <div class="divider"></div>
      <button v-for="t in topics" :key="t.id" :class="{ active: selectedTopic === t.id }" @click="switchToConcierge(t.id)">
        {{ t.icon }} {{ t.name }}
      </button>
    </div>

    <!-- 聊天區 -->
    <div
      ref="chatAreaRef"
      class="chat-area scrollbar-custom"
    >
      <!-- 置頂訊息 -->
      <div class="chat-message sticky-message">
        <div
          class="sticky-header"
          @click="toggleSticky"
        >
          <span>置頂公告：小幫手使用須知</span>
          <button class="toggle-btn">
            {{ isStickyOpen ? "-" : "+" }}
          </button>
        </div>
        <div
          v-show="isStickyOpen"
          class="sticky-body"
        >
          <span>小幫手會依據您輸入的內容，自動檢索本站臺的組件資料庫，或由 AI 導覽員為您深入解說數據。<br><br>
            當前模式：<strong>{{ currentMode === 'concierge' ? '🤖 AI 數據導覽' : '🔍 組件自動推薦' }}</strong></span>
        </div>
      </div>

      <!-- 模式切換按鈕 -->
      <div class="mode-switcher">
        <button :class="{ active: currentMode === 'recommend' }" @click="currentMode = 'recommend'">組件推薦</button>
        <button :class="{ active: currentMode === 'concierge' }" @click="currentMode = 'concierge'">數據導覽</button>
      </div>
      <div
        v-for="chat in chatData"
        :key="chat.id"
        class="message"
      >
        <!-- 機器人訊息 -->
        <div
          v-if="chat.role === 'bot'"
          class="bot"
        >
          <div class="avatar">
            <BotLogo />
          </div>
          <div class="content">
            <div
              v-if="chat.content"
              class="message--bubble"
            >
              <!-- 工具調用步驟 (如果有) -->
              <div v-if="chat.steps" class="tool-steps">
                <div v-for="step in chat.steps" :key="step.label" class="tool-step" :class="step.status">
                  <div v-if="step.status === 'running'" class="ts-spin"></div>
                  <span v-else class="ts-check">✓</span>
                  <span class="ts-text">{{ step.label }}</span>
                </div>
              </div>

              <!-- 數據卡片 (如果有) -->
              <div v-if="chat.dataCard" class="data-card">
                <div class="dc-head"><div class="dc-dot"></div>{{ chat.dataCard.label }}</div>
                <div class="dc-stats">
                  <div v-for="s in chat.dataCard.stats" :key="s.k" class="dc-stat">
                    <div><span class="dc-val">{{ s.v }}</span><span class="dc-unit">{{ s.u }}</span></div>
                    <div class="dc-key">{{ s.k }}</div>
                  </div>
                </div>
                <div v-if="chat.dataCard.bars" class="dc-bars">
                  <div v-for="b in chat.dataCard.bars" :key="b.l" class="dc-bar-row">
                    <span class="dc-bar-lbl">{{ b.l }}</span>
                    <div class="dc-bar-track"><div class="dc-bar-fill" :style="{ width: b.v + '%', background: b.c }"></div></div>
                    <span class="dc-bar-num">{{ b.v }}</span>
                  </div>
                </div>
              </div>

              <!-- PK 表格 (如果有) -->
              <div v-if="chat.pkData" class="pk-card">
                <div class="pk-header">
                  <div class="pk-city tp">🏙️ 台北市</div>
                  <div class="pk-city nt">🌆 新北市</div>
                </div>
                <div class="pk-body">
                  <div v-for="r in chat.pkData" :key="r.m" class="pk-row">
                    <div class="pk-metric">{{ r.m }}</div>
                    <div class="pk-val-tp" :class="{ win: r.better === 'tp' }">
                      {{ r.tp }} <span v-if="r.better === 'tp'" class="better">▶</span>
                    </div>
                    <div class="pk-val-nt" :class="{ win: r.better === 'nt' }">
                      <span v-if="r.better === 'nt'" class="better">◀</span> {{ r.nt }}
                    </div>
                  </div>
                </div>
              </div>

              <p>{{ chat.content }}</p>
            </div>
            <!-- 表格區 -->
            <div
              v-if="chat.relations"
              v-horizontal-wheel
              class="relation-area"
            >
              <table class="relation-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>城市名</th>
                    <th>組件名</th>
                    <th>關聯性</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, index) in chat.relations"
                    :key="index"
                  >
                    <td>{{ index + 1 }}</td>
                    <td>
                      {{
                        item.city === "taipei"
                          ? "臺北"
                          : "雙北"
                      }}
                    </td>
                    <td>{{ item.name }}</td>
                    <td>{{ item.score }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-if="chat.button"
              v-horizontal-wheel
              class="message--button scrollbar-x-hide"
            >
              <button
                v-for="btn in chat.button"
                :key="btn.id"
                @click="qaBtnHandler(btn.text, chat.relations)"
              >
                {{ btn.text }}
              </button>
            </div>
          </div>
        </div>
        <!-- 使用者訊息 -->
        <div
          v-else
          class="user"
        >
          <div class="avatar">
            <UserLogo />
          </div>
          <div
            v-if="chat.content"
            class="content"
          >
            <div class="message--bubble">
              <p>{{ chat.content }}</p>
            </div>
          </div>
        </div>
      </div>
      <!-- 打字中提示 -->
      <div v-if="isTyping" class="message typing">
        <div class="bot">
          <div class="avatar"><BotLogo /></div>
          <div class="message--bubble">
            <div class="dots"><span>.</span><span>.</span><span>.</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 輸入區 -->
    <div class="input-area">
      <!-- 快速引導 -->
      <div v-if="chatData.length <= 1" class="quick-guides">
        <button @click="qaBtnHandler('🔍 探索食安合格率')">🔍 探索食安</button>
        <button @click="qaBtnHandler('🔍 探索文化資產')">🔍 探索文化</button>
        <button @click="qaBtnHandler('🔍 探索避難缺口')">🔍 探索防災</button>
      </div>
      <div class="input-wrapper">
        <input
          v-model="userMessage"
          type="text"
          :placeholder="currentMode === 'concierge' ? '請輸入您的問題，例如：台北新北食安誰比較好？' : '請描述您的需求，例如：我想看人口統計圖表...'"
          @keyup.enter="sendBtnHandler(userMessage)"
        >
        <button @click="sendBtnHandler(userMessage)">
          <SendIcon />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* === 變數設定 === */
$bg-dark: #090909;
$panel-bg: #494b4e;
$card-bg: #282a2c;
$border-color: #888787;
$input-bg: #d9d9d9;
$white: #ffffff;
$scroll-thumb-hover: #ababab;
$radius-10: 10px;
$radius-15: 15px;
$radius-20: 20px;

/* === Scrollbar === */
.scrollbar-x-hide {
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.scrollbar-custom {
	&::-webkit-scrollbar {
		width: 2px;
		background: transparent;
	}

	&::-webkit-scrollbar-thumb {
		background: $white;
		border-radius: 8px;
	}

	&::-webkit-scrollbar-thumb:hover {
		background: $scroll-thumb-hover;
	}
}

/* === 主要樣式 === */
.chat-widget {
	width: 400px;
	border-radius: $radius-20;
	overflow: hidden;
	background: $bg-dark;
	border: 1px solid $border-color;
	display: flex;
	flex-direction: column;

	.header {
		padding: 12px 16px;
		background: $panel-bg;
		border-bottom: 1px solid $border-color;
		display: flex;
		justify-content: space-between;
		align-items: center;

		.brand-info {
			display: flex;
			align-items: center;
			gap: 10px;

			.brand-icon {
				width: 30px;
				height: 30px;
				background: $white;
				color: $bg-dark;
				border-radius: 6px;
				display: flex;
				align-items: center;
				justify-content: center;
				font-weight: bold;
			}

			.brand-text {
				h3 {
					font-size: 14px;
					font-weight: 700;
					color: $white;
					margin: 0;
					line-height: 1.2;
				}
				.sub-text {
					font-size: 11px;
					color: $border-color;
				}
			}
		}

		.nexus-badge {
			display: flex;
			align-items: center;
			gap: 6px;
			background: rgba(90, 156, 248, 0.1);
			border: 1px solid rgba(90, 156, 248, 0.3);
			border-radius: 4px;
			padding: 2px 8px;

			.nexus-dot {
				width: 6px;
				height: 6px;
				background: #5a9cf8;
				border-radius: 50%;
				box-shadow: 0 0 6px #5a9cf8;
				animation: pulse 2s infinite;
			}
			.nexus-label {
				font-size: 10px;
				color: #5a9cf8;
				font-weight: bold;
			}
		}
	}

	@keyframes pulse {
		0% { opacity: 1; box-shadow: 0 0 4px #5a9cf8; }
		50% { opacity: 0.5; box-shadow: 0 0 12px #5a9cf8; }
		100% { opacity: 1; box-shadow: 0 0 4px #5a9cf8; }
	}

	.topic-tabs {
		display: flex;
		padding: 8px;
		gap: 6px;
		background: #1a1a1a;
		border-bottom: 1px solid #333;
		overflow-x: auto;
		align-items: center;

		button {
			flex-shrink: 0;
			padding: 4px 12px;
			font-size: 12px;
			border-radius: 12px;
			background: #333;
			color: #aaa;
			border: 1px solid transparent;
			cursor: pointer;
			transition: all 0.2s;
			white-space: nowrap;

			&.active {
				background: rgba(90, 156, 248, 0.2);
				color: #5a9cf8;
				border-color: rgba(90, 156, 248, 0.4);
			}
		}

		.divider {
			width: 1px;
			height: 16px;
			background: #444;
			margin: 0 4px;
		}
	}

	.mode-switcher {
		display: flex;
		padding: 8px;
		gap: 8px;
		background: #1a1a1a;
		border-bottom: 1px solid #333;

		button {
			flex: 1;
			padding: 4px 8px;
			font-size: 12px;
			border-radius: 4px;
			background: #333;
			color: #888;
			border: 1px solid transparent;
			cursor: pointer;
			transition: all 0.2s;

			&.active {
				background: $panel-bg;
				color: $white;
				border-color: #888;
			}
		}
	}

	.chat-area {
		flex: 1;
		margin: 0.25rem;
		padding: 0.75rem;
		overflow-y: auto;
		background: $bg-dark;

		.chat-message {
			padding: 4px 10px;
			margin: 0px 8px;
			border-radius: 8px;
			background-color: $bg-dark;
		}

		// 置頂訊息
		.sticky-message {
			border: 1px solid #ffffff;
			position: sticky;
			top: 0;
			z-index: 10;

			.sticky-header {
				display: flex;
				font-weight: bold;
				justify-content: space-between;
				align-items: center;
				cursor: pointer;
				padding: 8px 12px;
			}

			.sticky-body {
				padding: 8px 12px;
				font-weight: 400;
				font-size: 14px;
			}

			.toggle-btn {
				background: none;
				border: none;
				font-size: 14px;
				cursor: pointer;
				color: #ffffff;
			}
		}

		.message {
			padding: 8px;

			.bot,
			.user {
				display: flex;
				gap: 0.5rem;
				align-items: flex-start;

				&.user {
					flex-direction: row-reverse;
				}

				.avatar {
					width: 40px;
					height: 40px;
					display: flex;
					align-items: center;
					justify-content: center;
					flex-shrink: 0;

					svg {
						width: 100%;
						height: auto;
					}
				}

				.content {
					display: flex;
					flex-direction: column;
					gap: 0.5rem;

					.relation-area {
						width: 100%;
						display: flex;
						align-items: center;
						margin-top: 8px;
						margin-bottom: 8px;

						.relation-table {
							min-width: max-content;
							font-size: 13px;
						}

						.relation-table th,
						.relation-table td {
							border: 1px solid #ccc;
							text-align: left;
							padding: 0px 8px;
							line-height: 1.1;
							vertical-align: middle;
						}

						.relation-table td {
							height: 2.5rem;
						}

						.relation-table th {
							font-weight: bold;
							text-align: center;
						}
					}

					.message--bubble {
						border: 1px solid rgba(255, 255, 255, 0.1);
						border-radius: 4px 15px 15px 15px;
						background: $card-bg;
						padding: 12px;
						max-width: 90%;

						p {
							color: $white;
							white-space: pre-line;
							margin: 0;
							font-size: 14px;
							line-height: 1.6;
						}

						.tool-steps {
							display: flex;
							flex-direction: column;
							gap: 4px;
							margin-bottom: 12px;
							
							.tool-step {
								display: flex;
								align-items: center;
								gap: 8px;
								font-size: 11px;
								color: #888;
								padding: 4px 8px;
								background: rgba(255,255,255,0.03);
								border-radius: 4px;

								&.running { color: #5a9cf8; }
								&.done { color: #4CAF50; }

								.ts-spin {
									width: 10px; height: 10px;
									border: 1.5px solid rgba(90,156,248,0.2);
									border-top-color: #5a9cf8;
									border-radius: 50%;
									animation: spin 0.6s linear infinite;
								}
								@keyframes spin { to { transform: rotate(360deg); } }
							}
						}

						.data-card {
							background: rgba(255,255,255,0.02);
							border: 1px solid rgba(255,255,255,0.05);
							border-left: 3px solid #5a9cf8;
							border-radius: 6px;
							padding: 10px;
							margin-bottom: 10px;

							.dc-head { font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
							.dc-dot { width: 5px; height: 5px; background: #5a9cf8; border-radius: 50%; }
							.dc-stats { display: flex; gap: 12px; margin-bottom: 8px; }
							.dc-stat {
								.dc-val { font-size: 18px; font-weight: bold; color: #fff; }
								.dc-unit { font-size: 10px; color: #666; margin-left: 2px; }
								.dc-key { font-size: 10px; color: #666; }
							}
							.dc-bars { display: flex; flex-direction: column; gap: 4px; }
							.dc-bar-row { display: flex; align-items: center; gap: 6px; font-size: 10px; }
							.dc-bar-lbl { width: 40px; color: #666; }
							.dc-bar-track { flex: 1; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; }
							.dc-bar-fill { height: 100%; border-radius: 2px; transition: width 0.8s ease-out; }
							.dc-bar-num { width: 25px; text-align: right; color: #666; }
						}

						.pk-card {
							margin-top: 12px;
							background: rgba(255,255,255,0.02);
							border: 1px solid rgba(255,255,255,0.05);
							border-radius: 8px;
							overflow: hidden;
							font-size: 11px;

							.pk-header { display: flex; border-bottom: 1px solid rgba(255,255,255,0.05); }
							.pk-city { flex: 1; padding: 6px; font-weight: bold; text-align: center; }
							.pk-city.tp { color: #5a9cf8; background: rgba(90,156,248,0.05); border-right: 1px solid rgba(255,255,255,0.05); }
							.pk-city.nt { color: #a07fe8; background: rgba(160,127,232,0.05); }
							
							.pk-row { display: flex; border-bottom: 1px solid rgba(255,255,255,0.02); }
							.pk-metric { flex: 1.2; padding: 6px; color: #888; border-right: 1px solid rgba(255,255,255,0.02); }
							.pk-val-tp { flex: 1; padding: 6px; text-align: right; border-right: 1px solid rgba(255,255,255,0.02); }
							.pk-val-nt { flex: 1; padding: 6px; }
							.win { color: #fff; font-weight: bold; }
							.better { font-size: 9px; margin: 0 2px; }
						}
					}

					.message--button {
						display: flex;
						gap: 0.5rem;
						overflow-x: auto;

						button {
							flex-shrink: 0;
							background: $panel-bg;
							color: $white;
							font-size: 14px;
							padding: 0.5rem 1rem;
							border-radius: $radius-15;
							border: none;
							cursor: pointer;
							white-space: nowrap;

							&:hover {
								filter: brightness(0.5);
							}
						}
					}
				}
			}
		}
	}

	.input-area {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem 1.125rem;
		background: $panel-bg;

		.quick-guides {
			display: flex;
			gap: 8px;
			overflow-x: auto;
			padding-bottom: 8px;

			button {
				background: rgba(255, 255, 255, 0.1);
				color: $white;
				border: 1px solid rgba(255, 255, 255, 0.3);
				border-radius: 12px;
				padding: 4px 12px;
				font-size: 12px;
				white-space: nowrap;
				cursor: pointer;

				&:hover {
					background: rgba(255, 255, 255, 0.2);
				}
			}
		}

		.input-wrapper {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			input[type="text"] {
				background: $white;
				height: 35px;
				width: 100%;
				border-radius: 20px;
				padding: 0 1rem;
				border: none;
				outline: none;
				color: black;
			}

			button {
				height: 35px;
				display: flex;
				align-items: center;
				justify-content: center;
				background: transparent;
				border: none;
				cursor: pointer;

				&:hover {
					filter: brightness(0.5);
				}
			}
		}
	}

	.typing {
		.dots {
			display: flex;
			gap: 4px;
			span {
				animation: blink 1s infinite;
				&:nth-child(2) { animation-delay: 0.2s; }
				&:nth-child(3) { animation-delay: 0.4s; }
			}
		}
	}

	@keyframes blink {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 1; }
	}
}
</style>
