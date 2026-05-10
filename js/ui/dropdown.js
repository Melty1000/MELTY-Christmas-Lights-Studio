// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                       CUSTOM DROPDOWN CLASS                               ║
// ║  Accordion-style dropdown with mutual exclusion and scroll-to behavior    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { logUser } from '../debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  CustomDropdown Class - Accordion Style
// ═══════════════════════════════════════════════════════════════════════════════

export class CustomDropdown {
    // Static array to track all dropdown instances for mutual exclusion
    static instances = [];

    constructor(selectElement, onChange) {
        this.selectElement = selectElement;
        this.onChange = onChange;
        this.isOpen = false;
        this.selectedValue = selectElement.value;
        this.options = Array.from(selectElement.options).map(opt => ({
            value: opt.value,
            label: opt.textContent
        }));

        // Create custom dropdown
        this.container = document.createElement('div');
        this.container.className = 'custom-dropdown';

        this.button = document.createElement('button');
        this.button.className = 'custom-dropdown-button';
        this.button.type = 'button';

        this.menu = document.createElement('div');
        this.menu.className = 'custom-dropdown-menu';

        this.container.appendChild(this.button);
        this.container.appendChild(this.menu);

        this.attachEvents();
        this.render();

        // Replace original select
        selectElement.style.display = 'none';
        selectElement.parentNode.insertBefore(this.container, selectElement);

        // Register this instance for mutual exclusion
        CustomDropdown.instances.push(this);
    }

    render() {
        const selectedOption = this.options.find(opt => opt.value === this.selectedValue);
        this.button.textContent = selectedOption ? selectedOption.label : 'Select...';

        this.menu.innerHTML = '';
        this.options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            if (option.value === this.selectedValue) {
                item.classList.add('selected');
            }
            item.textContent = option.label;
            item.dataset.value = option.value;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(option.value);
            });

            this.menu.appendChild(item);
        });
    }

    attachEvents() {
        this.button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Store handler reference for potential cleanup
        this._documentClickHandler = (e) => {
            if (this.isOpen && !this.container.contains(e.target)) {
                this.close();
            }
        };
        document.addEventListener('click', this._documentClickHandler);

        this.button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const currentIndex = this.options.findIndex(opt => opt.value === this.selectedValue);
                const nextIndex = Math.min(currentIndex + 1, this.options.length - 1);
                this.select(this.options[nextIndex].value);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const currentIndex = this.options.findIndex(opt => opt.value === this.selectedValue);
                const prevIndex = Math.max(currentIndex - 1, 0);
                this.select(this.options[prevIndex].value);
            } else if (e.key === 'Escape') {
                this.close();
            }
        });
    }

    // Cleanup method for removing listeners if dropdown is destroyed
    destroy() {
        if (this._documentClickHandler) {
            document.removeEventListener('click', this._documentClickHandler);
        }
        // Remove from instances array
        const idx = CustomDropdown.instances.indexOf(this);
        if (idx > -1) CustomDropdown.instances.splice(idx, 1);
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Close all OTHER dropdowns (mutual exclusion)
     */
    static closeAllOthers(exceptInstance) {
        CustomDropdown.instances.forEach(dropdown => {
            if (dropdown !== exceptInstance && dropdown.isOpen) {
                dropdown.close();
            }
        });
    }

    /**
     * Open this dropdown with accordion behavior:
     * - Close all other dropdowns
     * - Add scrolling class to theme-card
     * - Scroll button into view (nearest, not cutting header)
     */
    open() {
        // Mutual exclusion - close all others first
        CustomDropdown.closeAllOthers(this);

        this.isOpen = true;
        this.container.classList.add('open');

        // Find parent theme-card and add scroll class
        const themeCard = this.container.closest('.theme-card');
        if (themeCard) {
            themeCard.classList.add('has-open-dropdown');
        }

        // Smart scroll: scroll to show the setting-group header
        setTimeout(() => {
            const cardContent = this.container.closest('.card-content');
            const settingGroup = this.container.closest('.setting-group');
            if (cardContent && settingGroup) {
                // Get setting-group position (includes label above dropdown)
                const groupRect = settingGroup.getBoundingClientRect();
                const cardRect = cardContent.getBoundingClientRect();
                const currentScroll = cardContent.scrollTop;
                const groupTop = groupRect.top - cardRect.top + currentScroll;

                // Calculate max scroll (no empty space at bottom)
                const maxScroll = cardContent.scrollHeight - cardContent.clientHeight;

                // Scroll to show setting-group with slight padding at top
                const padding = 10;
                const targetScroll = Math.max(0, Math.min(groupTop - padding, maxScroll));
                cardContent.scrollTo({ top: targetScroll, behavior: 'smooth' });
            }
        }, 50); // Wait 50ms for dropdown to start expanding
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('open');

        // Check if any dropdown is still open in this theme-card
        const themeCard = this.container.closest('.theme-card');
        if (themeCard) {
            const anyOpen = themeCard.querySelector('.custom-dropdown.open');
            if (!anyOpen) {
                themeCard.classList.remove('has-open-dropdown');
            }
        }
    }

    select(value) {
        this.selectedValue = value;
        this.selectElement.value = value;
        this.render();

        if (this.onChange) this.onChange(value);

        const event = new Event('change', { bubbles: true });
        this.selectElement.dispatchEvent(event);

        this.close();
    }

    setValue(value) {
        this.select(value);
    }

    // Set value without triggering onChange (for initial sync from CONFIG)
    setValueSilent(value) {
        this.selectedValue = value;
        this.selectElement.value = value;
        this.render();
    }
}
