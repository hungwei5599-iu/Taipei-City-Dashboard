import { mount } from '@vue/test-utils';
import AedIsochroneMap from '../../src/components/custom/AedIsochroneMap.vue';
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('AedIsochroneMap.vue', () => {
	it('renders control bar and ai button', () => {
		const wrapper = mount(AedIsochroneMap);
		expect(wrapper.find('select.city-select').exists()).toBe(true);
		expect(wrapper.find('button.ai-button').exists()).toBe(true);
	});

	it('calls API to fetch data on mount', () => {
		axios.get.mockResolvedValue({ data: { data: [] } });
		mount(AedIsochroneMap);
		expect(axios.get).toHaveBeenCalledWith('/api/v1/dashboard/query/hackathon_d1_aed_map?city=taipei');
	});
});
