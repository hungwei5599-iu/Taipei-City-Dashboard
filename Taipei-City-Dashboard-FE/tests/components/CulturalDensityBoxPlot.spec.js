import { mount } from '@vue/test-utils';
import CulturalDensityBoxPlot from '../../src/components/custom/CulturalDensityBoxPlot.vue';
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('CulturalDensityBoxPlot.vue', () => {
	it('renders control bar and ai button', () => {
		const wrapper = mount(CulturalDensityBoxPlot, {
			global: {
				stubs: ['apexchart']
			}
		});
		expect(wrapper.find('select.city-select').exists()).toBe(true);
		expect(wrapper.find('button.ai-button').exists()).toBe(true);
	});

	it('calls API to fetch data on mount', () => {
		axios.get.mockResolvedValue({ data: { data: [] } });
		mount(CulturalDensityBoxPlot, {
			global: { stubs: ['apexchart'] }
		});
		expect(axios.get).toHaveBeenCalledWith('/api/v1/dashboard/query/hackathon_c3_cultural_density?city=taipei');
	});

	it('calls AI API when AI button is clicked', async () => {
		axios.post.mockResolvedValue({ data: { reply: 'AI Response' } });
		const wrapper = mount(CulturalDensityBoxPlot, {
			global: { stubs: ['apexchart'] }
		});
		await wrapper.find('button.ai-button').trigger('click');
		expect(axios.post).toHaveBeenCalledWith('/api/v1/ai/chat/twai', expect.any(Object));
	});
});
