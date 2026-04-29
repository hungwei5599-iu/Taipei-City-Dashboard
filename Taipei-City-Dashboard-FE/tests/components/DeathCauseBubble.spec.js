import { mount } from '@vue/test-utils';
import DeathCauseBubble from '../../src/components/custom/DeathCauseBubble.vue';
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('DeathCauseBubble.vue', () => {
	it('renders control bar and ai button', () => {
		const wrapper = mount(DeathCauseBubble, {
			global: { stubs: ['apexchart'] }
		});
		expect(wrapper.find('select.city-select').exists()).toBe(true);
		expect(wrapper.find('button.ai-button').exists()).toBe(true);
	});

	it('calls API to fetch data on mount', () => {
		axios.get.mockResolvedValue({ data: { data: [] } });
		mount(DeathCauseBubble, {
			global: { stubs: ['apexchart'] }
		});
		expect(axios.get).toHaveBeenCalledWith('/api/v1/dashboard/query/hackathon_d3_death_cause?city=taipei');
	});
});
