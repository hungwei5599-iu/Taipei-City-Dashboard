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
const { addChatData, addQueryData, saveChatLog, handleGuideButton } = chatStore;
const { createDashboard } = contentStore;
const { chatData } = storeToRefs(chatStore);
const { editDashboard } = storeToRefs(contentStore);
const { user } = storeToRefs(authStore);

const userMessage = ref("");
const chatAreaRef = ref(null);
const isStickyOpen = ref(false);
const dashboardCreationLoading = ref(false);

const qaBtnHandler = async (btn, chat) => {
	const text = typeof btn === "string" ? btn : btn?.text;
	if (btn?.action === "openGuideMap") {
		await handleGuideButton(chat);
		return;
	}
	if (text === "建立推薦儀表板" || text === "建立儀表板") {
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
		const components = Array.from(new Set((chat.relations || []).map((r) => r.id))).map(
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
			saveChatLog("建立推薦儀表板", "已建立推薦儀表板");
		} else {
			addChatData({
				role: "bot",
				content: "請先登入會員以使用此功能喔！",
			});
		}
		dashboardCreationLoading.value = false;
	}
};

const sendBtnHandler = (text) => {
	if (!text.trim()) return;
	addQueryData({
		role: "user",
		content: text,
	});
	userMessage.value = "";
};

const toggleSticky = () => {
	isStickyOpen.value = !isStickyOpen.value;
};

const getChartMax = (items) => {
	const values = (items || []).map((item) => Number(item.value) || 0);
	return Math.max(...values, 1);
};

const getBarWidth = (item, items) => {
	const value = Number(item.value) || 0;
	return `${Math.max(6, Math.round((value / getChartMax(items)) * 100))}%`;
};

const getHighlightedRows = (table) =>
	new Set((table.highlight || []).map((item) => item.rowIndex ?? item.row_index));

const followupHandler = (prompt) => {
	if (!prompt) return;
	addQueryData({
		role: "user",
		content: prompt,
	});
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
      <h3>臺北城市儀表板小幫手</h3>
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
          <span>小幫手會依據您輸入的內容，自動檢索本站臺的組件資料庫，並回傳相似度較高的組件清單，協助您快速找到符合需求的元件或資訊。<br><br>
            目前小幫手僅提供組件比對與分析服務，不支援一般聊天功能。如造成不便，敬請見諒！</span>
        </div>
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
              v-if="chat.isLoading"
              class="message--bubble message--loading"
            >
              <span class="loading-dot" />
              <span class="loading-dot" />
              <span class="loading-dot" />
            </div>
            <div
              v-else-if="chat.content"
              class="message--bubble"
            >
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="chat.html || chat.guidePayload?.html"
                class="message--html"
                v-html="chat.html || chat.guidePayload.html"
              />
              <!-- eslint-enable vue/no-v-html -->
              <p v-else>
                {{ chat.content }}
              </p>
            </div>
            <div
              v-if="chat.guidePayload"
              class="guide-response"
            >
              <div
                v-if="false && chat.guidePayload.tool_steps?.length"
                class="guide-block guide-steps"
              >
                <div class="guide-title">
                  資料處理
                </div>
                <div
                  v-for="step in chat.guidePayload.tool_steps"
                  :key="step.id"
                  class="guide-step"
                  :data-status="step.status"
                >
                  <span class="guide-step-dot" />
                  <span>{{ step.label }}</span>
                  <small>{{ step.status }}</small>
                </div>
              </div>

              <div
                v-for="card in chat.guidePayload.insight_cards || []"
                :key="card.id"
                class="guide-block guide-card"
              >
                <div class="guide-title">
                  {{ card.title }}
                </div>
                <p v-if="card.subtitle">
                  {{ card.subtitle }}
                </p>
                <div class="guide-stats">
                  <div
                    v-for="stat in card.stats || []"
                    :key="stat.label"
                    class="guide-stat"
                  >
                    <span>{{ stat.label }}</span>
                    <strong>{{ stat.value }}{{ stat.unit ? ` ${stat.unit}` : "" }}</strong>
                  </div>
                </div>
              </div>

              <div
                v-for="chart in chat.guidePayload.mini_charts || []"
                :key="chart.id"
                class="guide-block guide-chart"
              >
                <div class="guide-title">
                  {{ chart.title }}
                </div>
                <div
                  v-for="item in chart.data || []"
                  :key="item.label"
                  class="guide-bar"
                >
                  <span>{{ item.label }}</span>
                  <div class="guide-bar-track">
                    <div
                      class="guide-bar-fill"
                      :data-color="item.colorKey || item.color_key"
                      :style="{ width: getBarWidth(item, chart.data) }"
                    />
                  </div>
                  <strong>{{ item.value }} {{ chart.unit || "" }}</strong>
                </div>
              </div>

              <div
                v-for="table in chat.guidePayload.comparison_tables || []"
                :key="table.id"
                class="guide-block guide-table-wrap"
              >
                <div class="guide-title">
                  {{ table.title }}
                </div>
                <table class="guide-table">
                  <thead>
                    <tr>
                      <th
                        v-for="column in table.columns || []"
                        :key="column"
                      >
                        {{ column }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, rowIndex) in table.rows || []"
                      :key="rowIndex"
                      :data-highlight="getHighlightedRows(table).has(rowIndex)"
                    >
                      <td
                        v-for="(cell, cellIndex) in row"
                        :key="cellIndex"
                      >
                        {{ cell }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="chat.guidePayload.warnings?.length"
                class="guide-block guide-warning"
              >
                <div
                  v-for="warning in chat.guidePayload.warnings"
                  :key="warning"
                >
                  {{ warning }}
                </div>
              </div>

              <div
                v-if="chat.guidePayload.follow_up_questions?.length"
                class="guide-followups"
              >
                <button
                  v-for="question in chat.guidePayload.follow_up_questions"
                  :key="question.id"
                  @click="followupHandler(question.prompt)"
                >
                  {{ question.label }}
                </button>
              </div>
            </div>
            <!-- 表格區 -->
            <div
              v-if="chat.showRelations && chat.relations"
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
                @click="qaBtnHandler(btn, chat)"
              >
                {{ btn.action === "openGuideMap" ? "開啟組件" : btn.text }}
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
    </div>

    <!-- 輸入區 -->
    <div class="input-area">
      <input
        v-model="userMessage"
        type="text"
        placeholder="輸入訊息..."
        @keyup.enter="sendBtnHandler(userMessage)"
      >
      <button @click="sendBtnHandler(userMessage)">
        <SendIcon />
      </button>
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

@keyframes chat-loading-dot {
	0%,
	80%,
	100% {
		opacity: 0.35;
		transform: translateY(0);
	}

	40% {
		opacity: 1;
		transform: translateY(-4px);
	}
}

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
		padding: 1rem;
		background: $panel-bg;
		border-bottom: 3px solid $border-color;

		h3 {
			font-size: 18px;
			font-weight: 700;
			color: $white;
			margin: 0;
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
						border: 1px solid $white;
						border-radius: $radius-10;
						background: $card-bg;

						p {
							color: $white;
							white-space: pre-line;
							margin: 0;
							padding-top: 8px;
							padding-bottom: 8px;
							padding-left: 16px;
							padding-right: 16px;
							font-size: 16px;
						}
					}

					.message--loading {
						display: inline-flex;
						align-items: center;
						gap: 6px;
						width: fit-content;
						padding: 12px 16px;
						min-height: 20px;
					}

					.loading-dot {
						width: 7px;
						height: 7px;
						border-radius: 50%;
						background: #facc15;
						animation: chat-loading-dot 1s ease-in-out infinite;

						&:nth-child(2) {
							animation-delay: 0.15s;
						}

						&:nth-child(3) {
							animation-delay: 0.3s;
						}
					}

					.message--html {
						padding: 12px 14px;
						color: $white;
						font-size: 14px;
						line-height: 1.6;

						:deep(.guide-html-card),
						:deep(.guide-html-core) {
							display: grid;
							gap: 10px;
						}

						:deep(.guide-html-eyebrow) {
							color: #7ccf8a;
							font-size: 12px;
							font-weight: 700;
						}

						:deep(h4) {
							margin: 0;
							font-size: 18px;
							line-height: 1.3;
						}

						:deep(p) {
							margin: 0;
							padding: 0;
							font-size: 14px;
						}

						:deep(.guide-html-metrics) {
							display: grid;
							grid-template-columns: repeat(3, minmax(0, 1fr));
							gap: 8px;
						}

						:deep(.guide-html-metrics div) {
							border: 1px solid rgba(255, 255, 255, 0.12);
							border-radius: 8px;
							background: rgba(255, 255, 255, 0.05);
							padding: 8px;
							min-width: 0;
						}

						:deep(.guide-html-metrics span) {
							display: block;
							color: #ababab;
							font-size: 11px;
							margin-bottom: 4px;
						}

						:deep(.guide-html-metrics strong) {
							font-size: 15px;
						}

						:deep(.guide-html-table) {
							width: 100%;
							border-collapse: collapse;
							font-size: 12px;
						}

						:deep(.guide-html-table th),
						:deep(.guide-html-table td) {
							border-bottom: 1px solid rgba(255, 255, 255, 0.1);
							padding: 6px 4px;
							text-align: left;
						}

						:deep(.guide-html-table th) {
							color: #ababab;
							font-weight: 700;
						}

						:deep(.guide-html-action) {
							display: inline-flex;
							align-items: center;
							width: fit-content;
							border: 1px solid rgba(57, 194, 215, 0.5);
							border-radius: 8px;
							color: #061014;
							background: #39c2d7;
							padding: 7px 10px;
							font-size: 13px;
							font-weight: 700;
							text-decoration: none;
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

					.guide-response {
						display: grid;
						gap: 0.5rem;
					}

					.guide-block {
						border: 1px solid rgba(255, 255, 255, 0.16);
						border-radius: 8px;
						background: #20262e;
						color: $white;
						padding: 10px;
					}

					.guide-title {
						font-size: 13px;
						font-weight: 700;
						margin-bottom: 8px;
					}

					.guide-steps {
						background: rgba(57, 194, 215, 0.08);
					}

					.guide-step {
						display: grid;
						grid-template-columns: 14px minmax(0, 1fr) auto;
						gap: 8px;
						align-items: center;
						font-size: 12px;
						line-height: 1.35;

						& + .guide-step {
							margin-top: 6px;
						}

						small {
							color: #ababab;
						}
					}

					.guide-step-dot {
						width: 10px;
						height: 10px;
						border-radius: 50%;
						border: 2px solid #ababab;
					}

					.guide-step[data-status="done"] .guide-step-dot {
						border-color: #7ccf8a;
						background: #7ccf8a;
					}

					.guide-step[data-status="error"] .guide-step-dot {
						border-color: #ff6b5f;
						background: #ff6b5f;
					}

					.guide-card p {
						color: #ababab;
						font-size: 12px;
						margin: 0 0 8px;
					}

					.guide-stats {
						display: grid;
						grid-template-columns: repeat(3, minmax(0, 1fr));
						gap: 8px;
					}

					.guide-stat {
						border: 1px solid rgba(255, 255, 255, 0.1);
						border-radius: 8px;
						padding: 8px;
						min-width: 0;

						span {
							display: block;
							color: #ababab;
							font-size: 11px;
							margin-bottom: 4px;
						}

						strong {
							font-size: 16px;
						}
					}

					.guide-bar {
						display: grid;
						grid-template-columns: minmax(74px, 1fr) 1.4fr auto;
						gap: 8px;
						align-items: center;
						font-size: 12px;

						& + .guide-bar {
							margin-top: 8px;
						}
					}

					.guide-bar-track {
						height: 10px;
						border-radius: 999px;
						background: rgba(255, 255, 255, 0.08);
						overflow: hidden;
					}

					.guide-bar-fill {
						height: 100%;
						min-width: 4px;
						border-radius: 999px;
						background: #39c2d7;
					}

					.guide-bar-fill[data-color="ok"] {
						background: #7ccf8a;
					}

					.guide-bar-fill[data-color="busy"] {
						background: #f2a65a;
					}

					.guide-bar-fill[data-color="critical"] {
						background: #ff6b5f;
					}

					.guide-table-wrap {
						overflow-x: auto;
					}

					.guide-table {
						width: 100%;
						min-width: 360px;
						border-collapse: collapse;
						font-size: 12px;

						th,
						td {
							border-bottom: 1px solid rgba(255, 255, 255, 0.1);
							padding: 7px 6px;
							text-align: left;
							vertical-align: top;
						}

						th {
							color: #ababab;
						}

						tr[data-highlight="true"] td {
							background: rgba(124, 207, 138, 0.08);
						}
					}

					.guide-warning {
						border-color: rgba(255, 107, 95, 0.28);
						background: rgba(255, 107, 95, 0.1);
						color: #ffe0dd;
						font-size: 12px;
						line-height: 1.45;
					}

					.guide-followups {
						display: flex;
						flex-wrap: wrap;
						gap: 0.5rem;

						button {
							background: $panel-bg;
							color: $white;
							font-size: 13px;
							padding: 0.45rem 0.75rem;
							border-radius: 999px;
							border: 1px solid rgba(255, 255, 255, 0.14);
							cursor: pointer;
						}
					}
				}
			}
		}
	}

	.input-area {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem 1.125rem;
		background: $panel-bg;

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
</style>
