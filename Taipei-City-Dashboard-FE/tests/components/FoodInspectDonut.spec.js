import { mount } from '@vue/test-utils';
import FoodInspectDonut from '../../src/components/custom/FoodInspectDonut.vue';
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('FoodInspectDonut.vue', () => {
	it('renders control bar and ai button', () => {
		const wrapper = mount(FoodInspectDonut, {
			global: { stubs: ['apexchart'] }
		});
		expect(wrapper.find('select.city-select').exists()).toBe(true);
		expect(wrapper.find('button.ai-button').exists()).toBe(true);
	});

	it('calls API to fetch data on mount', () => {
		axios.get.mockResolvedValue({ data: { data: [] } });
		mount(FoodInspectDonut, {
			global: { stubs: ['apexchart'] }
		});
		expect(axios.get).toHaveBeenCalledWith('/api/v1/dashboard/query/hackathon_d2_food_inspection?city=taipei');
	});
});
