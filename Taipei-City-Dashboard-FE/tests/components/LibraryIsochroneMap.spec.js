import { mount } from '@vue/test-utils';
import LibraryIsochroneMap from '../../src/components/custom/LibraryIsochroneMap.vue';
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('LibraryIsochroneMap.vue', () => {
	it('renders control bar and ai button', () => {
		const wrapper = mount(LibraryIsochroneMap);
		expect(wrapper.find('select.city-select').exists()).toBe(true);
		expect(wrapper.find('button.ai-button').exists()).toBe(true);
	});

	it('calls API to fetch data on mount', () => {
		axios.get.mockResolvedValue({ data: { data: [] } });
		mount(LibraryIsochroneMap);
		expect(axios.get).toHaveBeenCalledWith('/api/v1/dashboard/query/hackathon_c5_library_map?city=taipei');
	});
});
