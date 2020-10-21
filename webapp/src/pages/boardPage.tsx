// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React from 'react'
import ReactDOM from 'react-dom'

import {BoardView} from '../blocks/boardView'
import {MutableBoardTree} from '../viewModel/boardTree'
import {FilterComponent} from '../components/filterComponent'
import {WorkspaceComponent} from '../components/workspaceComponent'
import {FlashMessage} from '../flashMessage'
import mutator from '../mutator'
import {OctoListener} from '../octoListener'
import {Utils} from '../utils'
import {MutableWorkspaceTree} from '../viewModel/workspaceTree'

type Props = {
}

type State = {
    boardId: string
    viewId: string
    workspaceTree: MutableWorkspaceTree
    boardTree?: MutableBoardTree
    filterAnchorElement?: HTMLElement
}

export default class BoardPage extends React.Component<Props, State> {
    view: BoardView

    updateTitleTimeout: number
    updatePropertyLabelTimeout: number

    private boardListener = new OctoListener()

    constructor(props: Props) {
        super(props)
	    const queryString = new URLSearchParams(window.location.search)
        const boardId = queryString.get('id')
        const viewId = queryString.get('v')

	    this.state = {
	        boardId,
            viewId,
            workspaceTree: new MutableWorkspaceTree(),
        }

	    Utils.log(`BoardPage. boardId: ${boardId}`)
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
	    Utils.log('componentDidUpdate')
        const board = this.state.boardTree?.board
        const prevBoard = prevState.boardTree?.board

	    const activeView = this.state.boardTree?.activeView
        const prevActiveView = prevState.boardTree?.activeView

	    if (board?.icon !== prevBoard?.icon) {
            Utils.setFavicon(board?.icon)
        }
	    if (board?.title !== prevBoard?.title || activeView?.title !== prevActiveView?.title) {
            document.title = `OCTO - ${board?.title} | ${activeView?.title}`
	    }
    }

    undoRedoHandler = async (e: KeyboardEvent) => {
        if (e.target !== document.body) {
            return
        }

	    if (e.keyCode === 90 && !e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {		// Cmd+Z
            Utils.log('Undo')
            const description = mutator.undoDescription()
            await mutator.undo()
	        if (description) {
	            FlashMessage.show(`Undo ${description}`)
	        } else {
	            FlashMessage.show('Undo')
	        }
        } else if (e.keyCode === 90 && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {		// Shift+Cmd+Z
            Utils.log('Redo')
	        const description = mutator.redoDescription()
            await mutator.redo()
            if (description) {
	            FlashMessage.show(`Redo ${description}`)
	        } else {
	            FlashMessage.show('Redo')
	        }
	    }
    }

    componentDidMount() {
	    document.addEventListener('keydown', this.undoRedoHandler)
	    if (this.state.boardId) {
            this.attachToBoard(this.state.boardId, this.state.viewId)
	    } else {
            this.sync()
	    }
    }

    componentWillUnmount() {
        Utils.log(`boardPage.componentWillUnmount: ${this.state.boardId}`)
        this.boardListener.close()
	    document.removeEventListener('keydown', this.undoRedoHandler)
    }

    render() {
        const {workspaceTree} = this.state

	    if (this.state.filterAnchorElement) {
	        const element = this.state.filterAnchorElement
	        const bodyRect = document.body.getBoundingClientRect()
	        const rect = element.getBoundingClientRect()

            // Show at bottom-left of element
            const maxX = bodyRect.right - 420 - 100
	        const pageX = Math.min(maxX, rect.left - bodyRect.left)
            const pageY = rect.bottom - bodyRect.top

            ReactDOM.render(
                <FilterComponent
                    boardTree={this.state.boardTree}
                    pageX={pageX}
                    pageY={pageY}
                    onClose={() => {
                        this.showFilter(undefined)
                    }}
                />,
                Utils.getElementById('modal'),
            )
        } else {
	        const modal = document.getElementById('modal')
	        if (modal) {
                ReactDOM.render(<div/>, modal)
            }
        }

        Utils.log(`BoardPage.render ${this.state.boardTree?.board?.title}`)
	    return (
    <div className='BoardPage'>
                <WorkspaceComponent
            workspaceTree={workspaceTree}
            boardTree={this.state.boardTree}
            showView={(id, boardId) => {
                        this.showView(id, boardId)
                    }}
            showBoard={(id) => {
                        this.showBoard(id)
                    }}
            showFilter={(el) => {
                        this.showFilter(el)
                    }}
            setSearchText={(text) => {
                        this.setSearchText(text)
                    }}
        />
            </div>
        )
    }

    private async attachToBoard(boardId: string, viewId?: string) {
	    Utils.log(`attachToBoard: ${boardId}`)

        if (!this.boardListener.isOpen) {
            this.boardListener.open([boardId], (blockId: string) => {
                Utils.log(`boardListener.onChanged: ${blockId}`)
                this.sync()
            })
        } else {
            this.boardListener.removeBlocks([this.state.boardId])
            this.boardListener.addBlocks([boardId])
        }

	    this.sync(boardId, viewId)
    }

    async sync(boardId: string = this.state.boardId, viewId: string | undefined = this.state.viewId) {
	    const {workspaceTree} = this.state
        Utils.log(`sync start: ${boardId}`)

	    await workspaceTree.sync()

	    if (boardId) {
	        const boardTree = new MutableBoardTree(boardId)
            await boardTree.sync()

	        // Default to first view
	        if (!viewId) {
	            viewId = boardTree.views[0].id
	        }

	        boardTree.setActiveView(viewId)

            // TODO: Handle error (viewId not found)
	        this.setState({
	            ...this.state,
                boardTree,
	            boardId,
	            viewId: boardTree.activeView.id,
            })
            Utils.log(`sync complete: ${boardTree.board.id} (${boardTree.board.title})`)
	    } else {
	        this.forceUpdate()
	    }
    }

    // IPageController
    showBoard(boardId: string) {
	    const {boardTree} = this.state

	    if (boardTree?.board?.id === boardId) {
            return
        }

	    const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + `?id=${encodeURIComponent(boardId)}`
	    window.history.pushState({path: newUrl}, '', newUrl)

        this.attachToBoard(boardId)
    }

    showView(viewId: string, boardId: string = this.state.boardId) {
        if (this.state.boardId !== boardId) {
            this.attachToBoard(boardId, viewId)
        } else {
            this.state.boardTree.setActiveView(viewId)
            this.setState({...this.state, viewId})
        }

        const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + `?id=${encodeURIComponent(boardId)}&v=${encodeURIComponent(viewId)}`
	    window.history.pushState({path: newUrl}, '', newUrl)
    }

    showFilter(anchorElement?: HTMLElement) {
	    this.setState({...this.state, filterAnchorElement: anchorElement})
    }

    setSearchText(text?: string) {
        this.state.boardTree?.setSearchText(text)
        this.setState({...this.state, boardTree: this.state.boardTree})
    }
}